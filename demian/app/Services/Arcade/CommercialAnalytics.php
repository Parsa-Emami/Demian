<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use JsonException;

final class CommercialAnalytics
{
    public function __construct(private readonly CampaignEconomics $economics) {}

    private function window($query,string $column,CarbonImmutable $from,CarbonImmutable $to)
    {
        return $query->where($column,'>=',$from->utc()->toDateTimeString())
            ->where($column,'<',$to->utc()->toDateTimeString());
    }

    private function ratio(int $n,int $d): ?float
    {
        return $d>0?round(100*$n/$d,2):null;
    }

    private function receipts(CarbonImmutable $from,CarbonImmutable $to)
    {
        return $this->window(DB::table('arcade_coupon_redemptions as r')
            ->join('arcade_coupons as c','c.id','=','r.coupon_id')
            ->where('r.channel','in_cafe'),'r.redeemed_at',$from,$to);
    }

    private function receiptGroups(CarbonImmutable $from,CarbonImmutable $to,array $fields): array
    {
        return $this->receipts($from,$to)->select($fields)
            ->selectRaw('COUNT(*) AS receipts, COALESCE(SUM(r.subtotal_minor),0) AS gross_minor, COALESCE(SUM(r.discount_minor),0) AS discount_minor')
            ->groupBy(...$fields)->orderBy(...array_slice($fields,0,1))->get()->map(function($r): array {
                $row=(array)$r;
                foreach(['receipts','gross_minor','discount_minor'] as $k)$row[$k]=(int)$row[$k];
                $row['net_minor']=$row['gross_minor']-$row['discount_minor'];
                $row['average_basket_minor']=$row['receipts']?intdiv($row['gross_minor'],$row['receipts']):null;
                $row['discount_share_percent']=$this->ratio($row['discount_minor'],$row['gross_minor']);
                return $row;
            })->all();
    }

    private function returnPurchases(CarbonImmutable $from,CarbonImmutable $to): array
    {
        $receipts=$this->receipts($from,$to);
        $perOwner=(clone $receipts)->whereNotNull('c.player_id')->select('c.player_id')
            ->selectRaw('COUNT(*) AS receipts')->groupBy('c.player_id');
        $known=(int)DB::query()->fromSub(clone $perOwner,'known_owners')->count();
        $repeat=(int)DB::query()->fromSub(clone $perOwner,'known_owners')->where('receipts','>=',2)->count();
        return ['known_coupon_owner_accounts'=>$known,'repeat_coupon_owner_accounts'=>$repeat,
            'repeat_percent'=>$this->ratio($repeat,$known),
            'receipts_with_erased_owner'=>(int)(clone $receipts)->whereNull('c.player_id')->count()];
    }

    private function couponSources(CarbonImmutable $from,CarbonImmutable $to): array
    {
        $issued=$this->window(DB::table('arcade_coupons as c'),'c.issued_at',$from,$to);
        $cutoff=$to->utc()->toDateTimeString();
        return $issued->leftJoin('arcade_coupon_redemptions as r',function($join)use($cutoff): void {
            $join->on('r.coupon_id','=','c.id')->where('r.channel','=','in_cafe')->where('r.redeemed_at','<',$cutoff);
        })->select('c.source','c.currency')
            ->selectRaw('COUNT(*) AS issued, COUNT(r.id) AS redeemed, SUM(c.max_discount_minor) AS issued_cap_minor')
            ->groupBy('c.source','c.currency')->orderBy('c.source')->orderBy('c.currency')->get()->map(fn($r)=>[
                'source'=>$r->source,'currency'=>$r->currency,'issued'=>(int)$r->issued,'redeemed'=>(int)$r->redeemed,
                'issued_cap_minor'=>(int)$r->issued_cap_minor,'redemption_percent'=>$this->ratio((int)$r->redeemed,(int)$r->issued),
            ])->all();
    }

    private function liveLiability(CarbonImmutable $asOf): array
    {
        return DB::table('arcade_coupons')->whereIn('status',['issued','reserved'])
            ->whereNotNull('player_id')->where('expires_at','>',$asOf->utc()->toDateTimeString())
            ->where('issued_at','<=',$asOf->utc()->toDateTimeString())
            ->select('source','currency')->selectRaw('COUNT(*) AS outstanding, SUM(max_discount_minor) AS maximum_minor')
            ->groupBy('source','currency')->orderBy('source')->orderBy('currency')->get()->map(fn($r)=>[
                'source'=>$r->source,'currency'=>$r->currency,'outstanding'=>(int)$r->outstanding,
                'maximum_minor'=>(int)$r->maximum_minor])->all();
    }

    private function qr(CarbonImmutable $from,CarbonImmutable $to): array
    {
        $query=DB::table('arcade_table_daily_launches as d')->join('arcade_cafe_tables as t','t.id','=','d.table_id')
            ->where('d.day','>=',$from->toDateString())->where('d.day','<',$to->toDateString());
        $totals=(clone $query)->selectRaw('COALESCE(SUM(d.launches),0) AS launches')->first();
        $capped=(int)(clone $query)->where('d.launches','>=',CafeTableService::DAILY_CAP)->count();
        $branches=(clone $query)->select('t.branch_id')->selectRaw('SUM(d.launches) AS launches, COUNT(DISTINCT t.id) AS tables')
            ->groupBy('t.branch_id')->orderBy('t.branch_id')->get()->map(fn($r)=>[
                'branch'=>$r->branch_id,'launches'=>(int)$r->launches,'tables'=>(int)$r->tables])->all();
        $tables=(clone $query)->select('t.id','t.branch_id','t.label')->selectRaw('SUM(d.launches) AS launches')
            ->groupBy('t.id','t.branch_id','t.label')->orderByDesc('launches')->orderBy('t.id')->limit(CafeTableService::TABLE_CAP)
            ->get()->map(fn($r)=>['branch'=>$r->branch_id,'table'=>$r->label,'launches'=>(int)$r->launches])->all();
        return ['launches'=>(int)$totals->launches,'saturated_table_days'=>$capped,'branches'=>$branches,'tables'=>$tables,
            'status'=>$capped?'lower_bound':($totals->launches?'ok':'no_data')];
    }

    private function quiet(CarbonImmutable $from,CarbonImmutable $to): array
    {
        $offers=DB::table('arcade_quiet_offers as o')->where('o.local_day','>=',$from->toDateString())
            ->where('o.local_day','<',$to->toDateString());
        $rows=(clone $offers)->select('o.branch_id','o.currency')
            ->selectRaw('COUNT(*) AS offers, SUM(o.capacity) AS capacity, SUM(o.capacity * o.max_discount_minor) AS reserved_minor')
            ->groupBy('o.branch_id','o.currency')->orderBy('o.branch_id')->orderBy('o.currency')->get();
        $claims=(clone $offers)->join('arcade_quiet_claims as q','q.offer_id','=','o.id')
            ->where('q.created_at','<',$to->utc()->toDateTimeString())
            ->leftJoin('arcade_coupon_redemptions as r',function($join)use($to): void {
                $join->on('r.coupon_id','=','q.coupon_id')->where('r.channel','=','in_cafe')
                    ->where('r.redeemed_at','<',$to->utc()->toDateTimeString());
            })->select('o.branch_id','o.currency')
            ->selectRaw('COUNT(q.id) AS claimed, COUNT(r.id) AS redeemed, COALESCE(SUM(r.subtotal_minor),0) AS gross_minor, COALESCE(SUM(r.discount_minor),0) AS discount_minor')
            ->groupBy('o.branch_id','o.currency')->get()->keyBy(fn($r)=>json_encode([$r->branch_id,$r->currency],JSON_THROW_ON_ERROR));
        return $rows->map(function($r)use($claims): array {
            $c=$claims->get(json_encode([$r->branch_id,$r->currency],JSON_THROW_ON_ERROR));
            $claimed=(int)($c->claimed??0);$redeemed=(int)($c->redeemed??0);
            return ['branch'=>$r->branch_id,'currency'=>$r->currency,'offers'=>(int)$r->offers,'capacity'=>(int)$r->capacity,
                'reserved_minor'=>(int)$r->reserved_minor,'claimed'=>$claimed,'redeemed'=>$redeemed,
                'claim_percent'=>$this->ratio($claimed,(int)$r->capacity),'redemption_percent'=>$this->ratio($redeemed,$claimed),
                'gross_minor'=>(int)($c->gross_minor??0),'discount_minor'=>(int)($c->discount_minor??0),
                'net_minor'=>(int)($c->gross_minor??0)-(int)($c->discount_minor??0)];
        })->all();
    }

    private function campaigns(CarbonImmutable $from,CarbonImmutable $to): array
    {
        $campaigns=DB::table('arcade_reward_campaigns as c')->join('arcade_weekly_periods as p','p.period_key','=','c.period_key')
            ->where('p.starts_at','<',$to->utc()->toDateTimeString())->where('p.ends_at','>',$from->utc()->toDateTimeString())
            ->select('c.*','p.status as period_status')->orderByDesc('p.starts_at')->limit(31)->get();
        $result=[];
        foreach($campaigns->take(30) as $c) {
            $row=['period'=>$c->period_key,'status'=>$c->status,'financial_status'=>'unavailable',
                'currency'=>null,'issued'=>null,'redeemed_all_channels'=>null,'outstanding_minor'=>null,
                'budget_minor'=>null,'committed_minor'=>null,'assumption_roi_percent'=>null,'recorded_roi_percent'=>null,
                'measurement_at'=>null];
            try {
                $terms=json_decode($c->terms,true,512,JSON_THROW_ON_ERROR);
                $report=$this->economics->report($c);
                $e=$report['economics'];$m=$c->period_status==='sealed'?$report['measurement']:null;
                $row=array_replace($row,['currency'=>$terms['currency']??null,'issued'=>$report['issued_count'],
                    'redeemed_all_channels'=>$report['redeemed_count'],'outstanding_minor'=>$report['outstanding_minor'],
                    'budget_minor'=>$e['budget_minor']??null,'committed_minor'=>$report['committed_minor'],
                    'financial_status'=>$m?'operator_measured':($e?'scenario_only':'no_approved_plan'),
                    'assumption_roi_percent'=>$report['scenario']['roi_percent']??null,'recorded_roi_percent'=>$m['roi_percent']??null,
                    'measurement_at'=>$m['recorded_at']??null]);
            } catch(RuntimeException|JsonException) {
                $row['financial_status']='invalid_or_unavailable';
            }
            $result[]=$row;
        }
        return ['status'=>$campaigns->count()>30?'incomplete':($result?'ok':'no_data'),'rows'=>$result];
    }

    private function delta(int $current,int $previous): array
    {
        return ['current'=>$current,'previous'=>$previous,'delta'=>$current-$previous,
            'change_percent'=>$previous>0?round(100*($current-$previous)/$previous,2):null];
    }

    public function snapshot(CarbonImmutable $from,CarbonImmutable $to,CarbonImmutable $asOf): array
    {
        $previous=$from->subDays((int)$from->diffInDays($to));
        $money=$this->receiptGroups($from,$to,['r.currency']);
        $prior=$this->receiptGroups($previous,$from,['r.currency']);
        $byCurrency=array_column($money,null,'currency');$oldByCurrency=array_column($prior,null,'currency');
        $currencies=array_unique(array_merge(array_keys($byCurrency),array_keys($oldByCurrency)));sort($currencies);
        $comparison=[];
        foreach($currencies as $currency){
            $now=$byCurrency[$currency]??[];$old=$oldByCurrency[$currency]??[];
            $row=['currency'=>$currency];
            foreach(['receipts','gross_minor','discount_minor','net_minor'] as $metric)
                $row[$metric]=$this->delta((int)($now[$metric]??0),(int)($old[$metric]??0));
            $comparison[]=$row;
        }
        $qr=$this->qr($from,$to);
        $priorQr=(int)DB::table('arcade_table_daily_launches')->where('day','>=',$previous->toDateString())
            ->where('day','<',$from->toDateString())->sum('launches');
        $priorCapped=DB::table('arcade_table_daily_launches')->where('day','>=',$previous->toDateString())
            ->where('day','<',$from->toDateString())->where('launches','>=',CafeTableService::DAILY_CAP)->exists();
        $qrComparison=$this->delta($qr['launches'],$priorQr);
        if($priorCapped||$qr['saturated_table_days'])$qrComparison['change_percent']=null;
        $trend=[];
        for($day=$from;$day->lt($to);$day=$end) {
            $end=$day->addDays(7)->min($to);
            $trend[]=['from'=>$day->toDateString(),'until_exclusive'=>$end->toDateString(),
                'receipts'=>$this->receiptGroups($day,$end,['r.currency']),
                'qr_launches'=>(int)DB::table('arcade_table_daily_launches')->where('day','>=',$day->toDateString())
                    ->where('day','<',$end->toDateString())->sum('launches')];
        }
        return [
            'comparison'=>['from'=>$previous->toDateString(),'until_exclusive'=>$from->toDateString(),
                'receipts_by_currency'=>$comparison,'qr'=>$qrComparison,'qr_comparison_exact'=>!$priorCapped&&!$qr['saturated_table_days']],
            'receipts_by_branch'=>$this->receiptGroups($from,$to,['r.branch_id','r.currency']),
            'receipts_by_source'=>$this->receiptGroups($from,$to,['c.source','r.currency']),
            'return_purchases'=>$this->returnPurchases($from,$to),'coupon_sources'=>$this->couponSources($from,$to),
            'live_liability'=>['as_of'=>$asOf->utc()->toIso8601String(),'rows'=>$this->liveLiability($asOf)],
            'qr'=>$qr,'quiet_hours'=>$this->quiet($from,$to),'campaigns_lifetime_live'=>$this->campaigns($from,$to),
            'commercial_trend'=>$trend,
        ];
    }
}
