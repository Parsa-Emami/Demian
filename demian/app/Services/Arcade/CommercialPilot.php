<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class CommercialPilot
{
    public const CATEGORIES=['ux','performance','security','operations','economics','retention'];
    public const METRICS=['receipt_count','contribution_minor','net_sales_minor','incidents','qr_launches','retention','latency'];

    private function today(): CarbonImmutable {return CarbonImmutable::now('Asia/Tehran')->startOfDay();}
    private function date(string $day): CarbonImmutable {return CarbonImmutable::parse($day,'Asia/Tehran')->startOfDay();}

    private function lock(int $actor,int $version): void
    {
        $staff=DB::table('arcade_cashier_staff')->where('id',$actor)->lockForUpdate()->first();
        CafeAccess::authorize($staff,'operations.readiness');
        abort_unless((int)$staff->session_version===$version,403);
        abort_unless(DB::table('arcade_pilot_lock')->where('id',1)->lockForUpdate()->first(),503);
    }

    private function pilot(int $id): object
    {
        $p=DB::table('arcade_commercial_pilots')->where('id',$id)->lockForUpdate()->first();
        abort_unless($p,404);
        return $p;
    }

    private function log(int $id,int $actor,string $type,string $ref,array $details=[]): void
    {
        DB::table('arcade_pilot_events')->insert(['pilot_id'=>$id,'actor_id'=>$actor,'event_type'=>$type,
            'evidence_ref'=>$ref,'details'=>json_encode($details,JSON_THROW_ON_ERROR),'created_at'=>now()->utc()]);
    }

    private function reference(string $ref): void
    {
        if(!preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{3,79}$/D',$ref))
            throw ValidationException::withMessages(['evidence_ref'=>'Use an opaque internal evidence reference, not personal information.']);
    }

    public function create(int $actor,int $version,array $d): int
    {
        $this->reference($d['evidence_ref']);
        $start=$this->date($d['pilot_start']);$days=(int)$d['days'];
        abort_unless(in_array($days,[7,14,28],true)&&in_array($d['mode'],['live','rehearsal'],true)
            &&$start->gte($this->today()->addDay())&&$start->lte($this->today()->addDays(30))
            &&preg_match('/^[A-Z]{3}$/D',$d['currency'])&&(int)$d['discount_budget_minor']>=1
            &&(int)$d['discount_budget_minor']<=200000000000000
            &&(int)$d['minimum_receipts']>=20&&(int)$d['minimum_receipts']<=10000
            &&(int)$d['target_uplift_bps']>=0&&(int)$d['target_uplift_bps']<=10000,422);
        return DB::transaction(function()use($actor,$version,$d,$start,$days): int {
            $this->lock($actor,$version);
            abort_unless(DB::table('arcade_cashier_staff')->where('branch_id',$d['branch_id'])->where('is_active',true)->exists(),422);
            abort_if(DB::table('arcade_commercial_pilots')->where('branch_id',$d['branch_id'])
                ->whereIn('status',['draft','active'])->exists(),409,'Close the earlier pilot first.');
            $id=DB::table('arcade_commercial_pilots')->insertGetId(['branch_id'=>$d['branch_id'],'mode'=>$d['mode'],
                'baseline_start'=>$start->subDays($days)->toDateString(),'pilot_start'=>$start->toDateString(),
                'days'=>$days,'currency'=>$d['currency'],'discount_budget_minor'=>(int)$d['discount_budget_minor'],
                'minimum_receipts'=>(int)$d['minimum_receipts'],'target_uplift_bps'=>(int)$d['target_uplift_bps'],
                'created_by'=>$actor,'status'=>'draft','created_at'=>now(),'updated_at'=>now()]);
            $this->log($id,$actor,'planned',$d['evidence_ref']);
            return $id;
        },3);
    }

    private function period(object $p,CarbonImmutable $day): ?string
    {
        $start=$this->date($p->pilot_start);
        if($day->gte($this->date($p->baseline_start))&&$day->lt($start))return 'baseline';
        if($day->gte($start)&&$day->lt($start->addDays((int)$p->days)))return 'pilot';
        return null;
    }

    private function observed(object $p,CarbonImmutable $day): array
    {
        $from=$day->utc()->toDateTimeString();$to=$day->addDay()->utc()->toDateTimeString();
        $r=DB::table('arcade_coupon_redemptions')->where('channel','in_cafe')->where('branch_id',$p->branch_id)
            ->where('redeemed_at','>=',$from)->where('redeemed_at','<',$to);
        abort_if((clone $r)->where('currency','!=',$p->currency)->exists(),409,'Separate currencies before evaluating sales.');
        $m=$r->selectRaw('COUNT(*) AS receipts, COALESCE(SUM(discount_minor),0) AS discount')->first();
        $qr=DB::table('arcade_table_daily_launches as d')->join('arcade_cafe_tables as t','t.id','=','d.table_id')
            ->where('t.branch_id',$p->branch_id)->where('d.day',$day->toDateString());
        return ['coupon_receipts'=>(int)$m->receipts,'coupon_discount_minor'=>(int)$m->discount,
            'qr_launches'=>(int)(clone $qr)->sum('d.launches'),
            'saturated_table_days'=>(int)$qr->where('d.launches','>=',CafeTableService::DAILY_CAP)->count()];
    }

    public function record(int $actor,int $version,int $id,array $d): void
    {
        $this->reference($d['evidence_ref']);
        $day=$this->date($d['day']);
        abort_unless($day->lt($this->today()),422,'Only complete Tehran days can be recorded.');
        DB::transaction(function()use($actor,$version,$id,$d,$day): void {
            $this->lock($actor,$version);$p=$this->pilot($id);
            $period=$this->period($p,$day);
            abort_unless($period&&(($period==='baseline'&&$p->status==='draft')||($period==='pilot'&&$p->status==='active')),409);
            abort_if(DB::table('arcade_pilot_daily')->where('pilot_id',$id)->where('day',$day->toDateString())->exists(),409,'Daily evidence is immutable.');
            $observed=$this->observed($p,$day);
            abort_unless((int)$d['receipts']>=$observed['coupon_receipts']&&(int)$d['receipts']<=100000
                &&(int)$d['receipts']>=0&&(int)$d['net_sales_minor']>=0
                &&(int)$d['net_sales_minor']<=100000000000000
                &&(int)$d['variable_cost_minor']>=0&&(int)$d['variable_cost_minor']<=100000000000000
                &&(int)$d['operating_cost_minor']>=0&&(int)$d['operating_cost_minor']<=100000000000000
                &&(int)$d['incidents']>=0&&(int)$d['incidents']<=1000,422);
            abort_if((int)$d['receipts']===0&&(int)$d['net_sales_minor']!==0,422);
            DB::table('arcade_pilot_daily')->insert(['pilot_id'=>$id,'day'=>$day->toDateString(),'period'=>$period,
                'receipts'=>(int)$d['receipts'],'net_sales_minor'=>(int)$d['net_sales_minor'],
                'variable_cost_minor'=>(int)$d['variable_cost_minor'],'operating_cost_minor'=>(int)$d['operating_cost_minor'],
                'incidents'=>(int)$d['incidents'],...$observed,'evidence_ref'=>$d['evidence_ref'],'actor_id'=>$actor,'created_at'=>now()]);
            $this->log($id,$actor,'daily_recorded',$d['evidence_ref'],['day'=>$day->toDateString()]);
        },3);
    }

    public function start(int $actor,int $version,int $id,string $ref): void
    {
        $this->reference($ref);
        DB::transaction(function()use($actor,$version,$id,$ref): void {
            $this->lock($actor,$version);$p=$this->pilot($id);
            abort_unless($p->status==='draft'&&$p->pilot_start===$this->today()->toDateString(),409,'Start on the planned day.');
            abort_unless(DB::table('arcade_pilot_daily')->where('pilot_id',$id)->where('period','baseline')->count()===(int)$p->days,409,'Complete baseline evidence first.');
            if($p->mode==='live'){
                abort_unless(app(PilotPreflight::class)->inspect()['passed'],409,'Production pilot preflight blocked.');
                abort_unless(DB::table('arcade_cashier_staff')->where('branch_id',$p->branch_id)->where('is_active',true)
                    ->whereIn('role',['cashier','manager'])->exists(),409);
            }else abort_if(app()->environment('production'),409,'Rehearsal is non-production only.');
            DB::table('arcade_commercial_pilots')->where('id',$id)->update(['status'=>'active','started_at_epoch'=>now()->timestamp,
                'release_sha'=>$p->mode==='live'?config('demian-pilot.release_sha'):null,
                'art_sha'=>$p->mode==='live'?config('demian-pilot.art_manifest_sha256'):null,'updated_at'=>now()]);
            $this->log($id,$actor,'started',$ref);
        },3);
    }

    public function summarize(object $p): array
    {
        $result=[];
        $rows=DB::table('arcade_pilot_daily')->where('pilot_id',$p->id)->orderBy('day')->get();
        foreach(['baseline','pilot'] as $period){
            $r=$rows->where('period',$period);
            $a=['days'=>$r->count()];
            foreach(['receipts','net_sales_minor','variable_cost_minor','operating_cost_minor','coupon_receipts','coupon_discount_minor','qr_launches','saturated_table_days','incidents'] as $k)
                $a[$k]=(int)$r->sum($k);
            $a['contribution_minor']=$a['net_sales_minor']-$a['variable_cost_minor']-$a['operating_cost_minor'];
            $result[$period]=$a;
        }
        $b=$result['baseline'];$a=$result['pilot'];$complete=$b['days']===(int)$p->days&&$a['days']===(int)$p->days;
        $enough=$complete&&$b['receipts']>=(int)$p->minimum_receipts&&$a['receipts']>=(int)$p->minimum_receipts;
        $uplift=$enough&&$b['contribution_minor']>0?round(100*($a['contribution_minor']-$b['contribution_minor'])/$b['contribution_minor'],2):null;
        $budget=$this->observedPilotDiscount($p);
        $consistent=true;
        foreach($rows as $row) {
            $observed=$this->observed($p,$this->date($row->day));
            foreach($observed as $k=>$v)if((int)$row->$k!==$v)$consistent=false;
        }
        $recommendation=($budget>(int)$p->discount_budget_minor||$a['incidents']>0)?'stop':
            (!$enough||!$consistent||$uplift===null?'inconclusive':($uplift>=(int)$p->target_uplift_bps/100?'review_scale':'iterate'));
        return [...$result,'complete'=>$complete,'enough_receipts'=>$enough,'ledger_consistent'=>$consistent,
            'contribution_change_percent'=>$uplift,'recorded_pilot_discount_minor'=>$budget,
            'discount_budget_exceeded'=>$budget>(int)$p->discount_budget_minor,'recommendation'=>$recommendation,
            'causal_roi'=>null,'measurement'=>'operator_attested_matched_weekday_before_after'];
    }

    private function observedPilotDiscount(object $p): int
    {
        $start=$this->date($p->pilot_start);
        return (int)DB::table('arcade_coupon_redemptions')->where('channel','in_cafe')->where('branch_id',$p->branch_id)
            ->where('currency',$p->currency)->where('redeemed_at','>=',$start->utc())
            ->where('redeemed_at','<',$start->addDays((int)$p->days)->utc())->sum('discount_minor');
    }

    public function transition(int $actor,int $version,int $id,string $action,string $ref): void
    {
        $this->reference($ref);
        DB::transaction(function()use($actor,$version,$id,$action,$ref): void {
            $this->lock($actor,$version);$p=$this->pilot($id);
            if($action==='stop'){
                abort_unless(in_array($p->status,['draft','active'],true),409);
                $status='stopped';$decision='stop';
            }else{
                abort_unless($p->status==='active'&&$this->today()->gte($this->date($p->pilot_start)->addDays((int)$p->days)),409);
                $report=$this->summarize($p);
                abort_unless($report['complete'],409,'Missing daily evidence.');
                abort_unless(in_array($action,['iterate','inconclusive','review_scale'],true),422);
                if($report['recommendation']==='stop')abort(409,'Use emergency stop.');
                abort_unless($action===$report['recommendation']||$action==='inconclusive',409,'Decision exceeds evidence.');
                $status='closed';$decision=$action;
            }
            DB::table('arcade_commercial_pilots')->where('id',$id)->update(['status'=>$status,'decision'=>$decision,
                'stopped_at_epoch'=>now()->timestamp,'updated_at'=>now()]);
            $this->log($id,$actor,'decision',$ref,['decision'=>$decision]);
        },3);
    }

    public function action(int $actor,int $version,int $id,array $d): void
    {
        $this->reference($d['evidence_ref']);
        abort_unless(in_array($d['category'],self::CATEGORIES,true)&&in_array($d['success_metric'],self::METRICS,true),422);
        $due=$this->date($d['due_day']);
        abort_unless($due->gte($this->today())&&$due->lte($this->today()->addDays(90)),422);
        DB::transaction(function()use($actor,$version,$id,$d,$due): void {
            $this->lock($actor,$version);$this->pilot($id);
            abort_if(DB::table('arcade_pilot_actions')->where('pilot_id',$id)->count()>=50,409);
            $action=DB::table('arcade_pilot_actions')->insertGetId(['pilot_id'=>$id,'category'=>$d['category'],
                'success_metric'=>$d['success_metric'],'due_day'=>$due->toDateString(),'evidence_ref'=>$d['evidence_ref'],
                'owner_id'=>$actor,'status'=>'open','created_at'=>now(),'updated_at'=>now()]);
            $this->log($id,$actor,'action_created',$d['evidence_ref'],['action_id'=>$action]);
        },3);
    }

    public function resolve(int $actor,int $version,int $id,int $action,string $ref): void
    {
        $this->reference($ref);
        DB::transaction(function()use($actor,$version,$id,$action,$ref): void {
            $this->lock($actor,$version);$this->pilot($id);
            abort_unless(DB::table('arcade_pilot_actions')->where('pilot_id',$id)->where('id',$action)->where('status','open')
                ->update(['status'=>'done','updated_at'=>now()])===1,409);
            $this->log($id,$actor,'action_resolved',$ref,['action_id'=>$action]);
        },3);
    }

    public function listing(): array
    {
        return DB::table('arcade_commercial_pilots')->orderByDesc('id')->limit(30)->get(['id','branch_id','mode','status','pilot_start','days','decision'])->all();
    }

    public function detail(int $id): array
    {
        $p=DB::table('arcade_commercial_pilots')->where('id',$id)->first();abort_unless($p,404);
        return ['pilot'=>$p,'report'=>$this->summarize($p),'daily'=>DB::table('arcade_pilot_daily')->where('pilot_id',$id)
            ->orderBy('day')->get(['day','period','receipts','net_sales_minor','variable_cost_minor','operating_cost_minor','incidents','evidence_ref']),
            'actions'=>DB::table('arcade_pilot_actions')->where('pilot_id',$id)->orderBy('id')->get(),
            'events'=>DB::table('arcade_pilot_events')->where('pilot_id',$id)->orderByDesc('id')->limit(100)
                ->get(['event_type','evidence_ref','created_at'])];
    }
}
