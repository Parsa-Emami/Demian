<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;

final class QuietHoursService
{
    public function __construct(private readonly CouponPolicy $policy,private readonly PhoneIdentityService $identity,
        private readonly CampaignEconomics $economics) {}

    private function integer(string $key,int $min,int $max): int
    {
        $v=config('demian-quiet-hours.'.$key);
        if ((!is_int($v)&&!is_string($v))||!preg_match('/^[0-9]{1,15}$/D',(string)$v)
            ||(int)$v<$min||(int)$v>$max) throw new RuntimeException('Missing approved quiet-hours policy input.');
        return (int)$v;
    }

    private function terms(): array
    {
        abort_unless(config('demian-quiet-hours.enabled')===true && config('demian-coupons.cafe_enabled')===true
            && $this->identity->ready(),503,'Quiet-hour offers are not enabled.');
        if(!app()->environment('testing')) abort_unless(config('demian-legal.publication_approved')===true
            &&config('demian-legal.require_acceptance')===true,503);
        try {
            return [...$this->policy->approved(),'daily_budget_minor'=>$this->integer('daily_budget_minor',1,200000000000000),
                'max_percent'=>$this->integer('max_percent',1,10),'threshold'=>$this->integer('occupancy_threshold_percent',1,100),
                'cost_ceiling_bps'=>$this->integer('cost_ceiling_bps',0,9999),'margin_floor_bps'=>$this->integer('margin_floor_bps',1,9999)];
        } catch(RuntimeException) { abort(503,'Quiet-hour financial policy requires approval.'); }
    }

    private function lock(): void
    {
        abort_unless(DB::table('arcade_quiet_hours_lock')->where('id',1)->lockForUpdate()->first(),503);
    }

    private function staff(int $id,int $version): void
    {
        $staff=DB::table('arcade_cashier_staff')->where('id',$id)->lockForUpdate()->first();
        CafeAccess::authorizeGift($staff);
        abort_unless((int)$staff->session_version===$version,403);
    }

    private function audit(int $actor,string $event,int $id): void
    {
        DB::table('arcade_cashier_admin_events')->insert(['actor_id'=>$actor,'subject_id'=>null,'event_type'=>$event,
            'details'=>json_encode(['offer_id'=>$id],JSON_THROW_ON_ERROR),'created_at'=>now()->utc()]);
    }

    public function create(int $actor,int $version,array $input): int
    {
        $t=$this->terms();
        $now=CarbonImmutable::now('Asia/Tehran');
        $start=CarbonImmutable::createFromFormat('!Y-m-d\TH:i',$input['starts_at'],'Asia/Tehran');
        $end=CarbonImmutable::createFromFormat('!Y-m-d\TH:i',$input['ends_at'],'Asia/Tehran');
        $seats=(int)$input['total_seats'];$occupied=(int)$input['occupied_seats'];
        $percent=(int)$input['percent'];$minimum=(int)$input['min_order_minor'];
        $cap=(int)$input['max_discount_minor'];$capacity=(int)$input['capacity'];
        $discount=min(CampaignEconomics::floorBps($minimum,$percent*100),$cap);
        if($start->format('Y-m-d\TH:i')!==$input['starts_at']||$end->format('Y-m-d\TH:i')!==$input['ends_at']
            ||$start->lt($now->startOfMinute())||$start->gt($now->addMinutes(30))
            ||$start->toDateString()!==$end->toDateString()||$end->lte($start)||$end->gt($start->addHours(4))
            ||$seats<1||$seats>1000||$occupied<0||$occupied>$seats||100*$occupied>$t['threshold']*$seats
            ||$percent<1||$percent>$t['max_percent']||$minimum<$t['min_order_minor']||$minimum>1000000000000
            ||$cap<1||$cap>$t['max_discount_minor']||$capacity<1||$capacity>20
            ||!$this->economics->marginSafe($minimum,$discount,$t)) {
            throw ValidationException::withMessages(['offer'=>'Window, observed occupancy or financial terms are outside approved limits.']);
        }
        return DB::transaction(function()use($actor,$version,$input,$t,$start,$end,$now,$seats,$occupied,$percent,$minimum,$cap,$capacity): int {
            $this->staff($actor,$version);$this->lock();
            abort_unless(DB::table('arcade_cashier_staff')->where('branch_id',$input['branch_id'])->where('is_active',true)->exists(),422);
            abort_unless($end->gt(CarbonImmutable::now('Asia/Tehran')),409,'Offer expired while awaiting approval.');
            $day=$start->toDateString();
            $offers=DB::table('arcade_quiet_offers')->where('local_day',$day);
            abort_if((clone $offers)->where('currency','!=',$t['currency'])->exists(),409,'Cannot mix currencies in a daily budget.');
            abort_if((clone $offers)->where('branch_id',$input['branch_id'])
                ->where('starts_at','<',$end->utc())->where('ends_at','>',$start->utc())->exists(),409,'Overlapping window.');
            $reserved=(int)(clone $offers)->selectRaw('COALESCE(SUM(capacity * max_discount_minor),0) AS amount')->value('amount');
            abort_if($reserved+$cap*$capacity>$t['daily_budget_minor'],409,'Daily approved budget exceeded.');
            $id=DB::table('arcade_quiet_offers')->insertGetId([
                'branch_id'=>$input['branch_id'],'local_day'=>$day,'starts_at'=>$start->utc(),'ends_at'=>$end->utc(),
                'observed_at'=>$now->utc(),'occupied_seats'=>$occupied,'total_seats'=>$seats,'percent'=>$percent,
                'currency'=>$t['currency'],'policy_version'=>$t['version'],'min_order_minor'=>$minimum,'max_discount_minor'=>$cap,
                'capacity'=>$capacity,'cost_ceiling_bps'=>$t['cost_ceiling_bps'],'margin_floor_bps'=>$t['margin_floor_bps'],
                'paused'=>false,'created_by'=>$actor,'created_at'=>$now->utc(),'updated_at'=>$now->utc()]);
            $this->audit($actor,'quiet_offer_created',$id);
            return $id;
        },3);
    }

    public function pause(int $actor,int $version,int $id): void
    {
        DB::transaction(function()use($actor,$version,$id): void {
            $this->staff($actor,$version);$this->lock();
            $offer=DB::table('arcade_quiet_offers')->where('id',$id)->lockForUpdate()->first();
            abort_unless($offer,404);
            if($offer->paused)return;
            DB::table('arcade_quiet_offers')->where('id',$id)->update(['paused'=>true,'updated_at'=>now()->utc()]);
            $this->audit($actor,'quiet_offer_paused',$id);
        },3);
    }

    private function active()
    {
        $now=CarbonImmutable::now('UTC');
        return DB::table('arcade_quiet_offers')->where('paused',false)
            ->where('starts_at','<=',$now)->where('ends_at','>',$now);
    }

    private function recipient(ArcadePlayer $player): ?object
    {
        $phone=$this->identity->identity($player->id);
        if(!$phone||CarbonImmutable::parse($phone->verified_at,'UTC')->gt(CarbonImmutable::now('UTC')->subHours(48)))return null;
        if(config('demian-legal.require_acceptance')===true
            &&($player->legal_policy_version!==config('demian-legal.version')||$player->legal_accepted_at===null))return null;
        return $phone;
    }

    private function identityDigest(object $phone,string $day): string
    {
        return $this->identity->digest('quiet-hours-day-v1',$day,$phone->phone_hash);
    }

    private function prior(string $player,string $digest,string $day): ?object
    {
        return DB::table('arcade_quiet_claims')->where('local_day',$day)->where(function($q)use($player,$digest): void {
            $q->where('player_id',$player)->orWhere('identity_digest',$digest);
        })->first();
    }

    public function offers(ArcadePlayer $player): array
    {
        try {$t=$this->terms();}catch(\Symfony\Component\HttpKernel\Exception\HttpException $e){
            if($e->getStatusCode()===503)return ['available'=>false,'eligible'=>false,'data'=>[]];
            throw $e;
        }
        $phone=$this->recipient($player);
        $day=CarbonImmutable::now('Asia/Tehran')->toDateString();
        $eligible=$phone!==null&&!$this->prior($player->id,$this->identityDigest($phone,$day),$day);
        $rows=$this->active()->where('currency',$t['currency'])->where('policy_version',$t['version'])
            ->where('percent','<=',$t['max_percent'])->where('max_discount_minor','<=',$t['max_discount_minor'])
            ->where('min_order_minor','>=',$t['min_order_minor'])
            ->where('cost_ceiling_bps',$t['cost_ceiling_bps'])->where('margin_floor_bps',$t['margin_floor_bps'])
            ->whereRaw('100 * occupied_seats <= ? * total_seats',[$t['threshold']])
            ->orderBy('ends_at')->limit(50)->get();
        return ['available'=>true,'eligible'=>$eligible,'data'=>$rows->map(function($o): array {
            $used=DB::table('arcade_quiet_claims')->where('offer_id',$o->id)->count();
            return ['id'=>(int)$o->id,'branch'=>$o->branch_id,'percent'=>(int)$o->percent,'currency'=>$o->currency,
                'minimum_minor'=>(int)$o->min_order_minor,'cap_minor'=>(int)$o->max_discount_minor,
                'ends_at'=>CarbonImmutable::parse($o->ends_at,'UTC')->toIso8601String(),
                'remaining'=>max(0,(int)$o->capacity-$used)];
        })->filter(fn($o)=>$o['remaining']>0)->values()->all()];
    }

    public function claim(ArcadePlayer $actor,int $id): array
    {
        $t=$this->terms();
        return DB::transaction(function()use($actor,$id,$t): array {
            $player=ArcadePlayer::query()->lockForUpdate()->find($actor->id);
            abort_unless($player&&hash_equals($player->token_hash,$actor->token_hash)
                &&$player->token_expires_at?->isFuture(),401);
            $this->lock();
            $phone=$this->recipient($player);
            abort_unless($phone,403,'Verified phone must be at least 48 hours old.');
            $day=CarbonImmutable::now('Asia/Tehran')->toDateString();
            $digest=$this->identityDigest($phone,$day);
            $prior=$this->prior($player->id,$digest,$day);
            if($prior) {
                abort_unless($prior->player_id===$player->id&&(int)$prior->offer_id===$id,409,'One quiet-hour coupon per verified identity per day.');
                return ['coupon_id'=>(int)$prior->coupon_id,'idempotent_replay'=>true];
            }
            $o=$this->active()->where('id',$id)->lockForUpdate()->first();
            abort_unless($o&&$o->local_day===$day&&$o->currency===$t['currency']&&$o->policy_version===$t['version']
                &&(int)$o->percent<=$t['max_percent']&&(int)$o->max_discount_minor<=$t['max_discount_minor']
                &&(int)$o->min_order_minor>=$t['min_order_minor']
                &&100*(int)$o->occupied_seats<=$t['threshold']*(int)$o->total_seats
                &&(int)$o->cost_ceiling_bps===$t['cost_ceiling_bps']&&(int)$o->margin_floor_bps===$t['margin_floor_bps'],409,'Offer no longer available.');
            abort_if(DB::table('arcade_quiet_claims')->where('offer_id',$id)->count()>=(int)$o->capacity,409,'Offer exhausted.');
            $daily=DB::table('arcade_quiet_offers')->where('local_day',$day);
            abort_if((clone $daily)->where('currency','!=',$t['currency'])->exists(),409,'Cannot mix currencies in a daily budget.');
            $total=(int)$daily->selectRaw('COALESCE(SUM(capacity * max_discount_minor),0) AS amount')->value('amount');
            abort_if($total>$t['daily_budget_minor'],409,'Daily budget no longer approved.');
            $code='DMC-'.strtoupper(bin2hex(random_bytes(16)));$now=CarbonImmutable::now('UTC');
            $coupon=DB::table('arcade_coupons')->insertGetId(['winner_id'=>null,'source'=>'quiet_hours','player_id'=>$player->id,
                'code_hash'=>hash('sha256',$code),'code_ciphertext'=>Crypt::encryptString($code),
                'policy_version'=>$o->policy_version,'discount_percent'=>$o->percent,'currency'=>$o->currency,
                'min_order_minor'=>$o->min_order_minor,'max_discount_minor'=>$o->max_discount_minor,'status'=>'issued',
                'issued_at'=>$now,'expires_at'=>$o->ends_at,'created_at'=>$now,'updated_at'=>$now]);
            DB::table('arcade_quiet_claims')->insert(['offer_id'=>$id,'coupon_id'=>$coupon,'player_id'=>$player->id,
                'local_day'=>$day,'identity_digest'=>$digest,'created_at'=>$now]);
            app(CouponIssuanceService::class)->audit($coupon,'issued',['source'=>'quiet_hours','offer_id'=>$id]);
            return ['coupon_id'=>$coupon,'idempotent_replay'=>false];
        },3);
    }

    public function offerForCoupon(int $coupon): ?object
    {
        return DB::table('arcade_quiet_claims as q')->join('arcade_quiet_offers as o','o.id','=','q.offer_id')
            ->where('q.coupon_id',$coupon)->select('o.*')->first();
    }

    public function assertRedemption(object $coupon,string $branch,int $subtotal,int $discount): void
    {
        if($coupon->source!=='quiet_hours')return;
        $o=$this->offerForCoupon((int)$coupon->id);
        abort_unless($o&&$o->branch_id===$branch&&$coupon->currency===$o->currency
            &&$coupon->policy_version===$o->policy_version&&(int)$coupon->discount_percent===(int)$o->percent
            &&(int)$coupon->min_order_minor===(int)$o->min_order_minor&&(int)$coupon->max_discount_minor===(int)$o->max_discount_minor
            &&$coupon->expires_at===$o->ends_at,409,'Offer branch or frozen terms mismatch.');
        $now=CarbonImmutable::now('UTC')->toDateTimeString();
        abort_unless($now>=$o->starts_at&&$now<$o->ends_at,409,'Outside offer window.');
        abort_unless($this->economics->marginSafe($subtotal,$discount,[
            'cost_ceiling_bps'=>(int)$o->cost_ceiling_bps,'margin_floor_bps'=>(int)$o->margin_floor_bps]),422,'Margin guard rejected bill.');
    }

    public function report(): array
    {
        return DB::table('arcade_quiet_offers')->orderByDesc('id')->limit(100)->get()->map(function($o): array {
            $claims=DB::table('arcade_quiet_claims')->where('offer_id',$o->id)->count();
            $r=DB::table('arcade_quiet_claims as q')->join('arcade_coupon_redemptions as r','r.coupon_id','=','q.coupon_id')
                ->where('q.offer_id',$o->id)->where('r.channel','in_cafe')
                ->selectRaw('COUNT(*) AS redeemed,COALESCE(SUM(r.subtotal_minor),0) AS gross,COALESCE(SUM(r.discount_minor),0) AS discount')->first();
            return [...(array)$o,'claimed'=>$claims,'redeemed'=>(int)$r->redeemed,'gross'=>(int)$r->gross,
                'discount'=>(int)$r->discount,'reserved_minor'=>(int)$o->capacity*(int)$o->max_discount_minor];
        })->all();
    }

    public function prune(): void
    {
        DB::table('arcade_quiet_claims')->where('local_day','<',CarbonImmutable::now('Asia/Tehran')->subDays(90)->toDateString())
            ->whereNotNull('identity_digest')->update(['identity_digest'=>null]);
    }
}
