<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ReferralService
{
    public const POINTS = 10;
    public const MONTHLY_INVITER_CAP = 10;
    public const MONTHLY_GLOBAL_CAP = 100;
    public const CLAIM_DAYS = 30;

    public function available(): bool
    {
        return config('demian-referrals.enabled') === true && app(PhoneIdentityService::class)->ready();
    }

    private function lock(): void
    {
        abort_unless(DB::table('arcade_referral_lock')->where('id',1)->lockForUpdate()->first(),503);
    }

    public function code(string $player): string
    {
        abort_unless($this->available(),503);
        return DB::transaction(function () use ($player): string {
            $this->lock();
            abort_unless(app(PhoneIdentityService::class)->identity($player),403);
            $old=DB::table('arcade_referral_codes')->where('player_id',$player)->value('code');
            if ($old) return $old;
            do { $code=strtoupper(bin2hex(random_bytes(8))); }
            while (DB::table('arcade_referral_codes')->where('code',$code)->exists());
            DB::table('arcade_referral_codes')->insert(['player_id'=>$player,'code'=>$code,'created_at'=>now()->utc()]);
            return $code;
        },3);
    }

    public function attribute(string $player,string $code): void
    {
        abort_unless($this->available(),503);
        if (DB::transactionLevel()<1) throw new \LogicException('Registration transaction required.');
        $this->lock();
        $inviter=DB::table('arcade_referral_codes')->where('code',strtoupper($code))->value('player_id');
        if (!$inviter || $inviter===$player || !app(PhoneIdentityService::class)->identity($inviter)) {
            throw ValidationException::withMessages(['referral_code'=>'Invalid invitation. Remove the code to register without an invitation.']);
        }
        DB::table('arcade_referrals')->insert([
            'player_id'=>$player,'inviter_id'=>$inviter,'status'=>'pending','points'=>0,
            'created_at'=>now()->utc(),'expires_at'=>now()->utc()->addDays(self::CLAIM_DAYS),
        ]);
    }

    public function profile(string $player): array
    {
        $q=DB::table('arcade_referrals')->where('inviter_id',$player);
        $counts=(clone $q)->selectRaw('status, COUNT(*) AS total')->groupBy('status')->pluck('total','status');
        $total=(int)$counts->sum();
        $success=(int)($counts['qualified']??0);
        $own=DB::table('arcade_referrals')->where('player_id',$player)->first(['status','expires_at','qualified_at']);
        return ['available'=>$this->available(),'verified'=>app(PhoneIdentityService::class)->identity($player)!==null,
            'code'=>DB::table('arcade_referral_codes')->where('player_id',$player)->value('code'),
            'invited'=>$total,'qualified'=>$success,'pending'=>(int)($counts['pending']??0),
            'review'=>(int)($counts['review']??0),'points'=>(int)(clone $q)->sum('points'),
            'conversion_percent'=>$total?round(100*$success/$total,2):0,
            'attribution'=>$own,'financial_rewards'=>false,'points_per_success'=>self::POINTS,
            'monthly_cap'=>self::MONTHLY_INVITER_CAP];
    }

    private function activity(string $player,object $identity,object $claim): bool
    {
        $start=max($identity->verified_at,$claim->created_at);
        $q=DB::table('arcade_runs as r')->where('r.player_id',$player)
            ->whereIn('r.game_id',PersonalProgressService::GAMES)->where('r.status','verified')
            ->where('r.score','>',0)->whereNotNull('r.replay_hash')->whereNotNull('r.completed_at')
            ->where('r.started_at','>=',$start)->where('r.completed_at','<=',$claim->expires_at)
            ->whereExists(function ($sub): void {
                $sub->selectRaw('1')->from('arcade_personal_progress as p')
                    ->join('arcade_weekly_periods as w','w.period_key','=','p.period_key')
                    ->where('w.status','sealed')->where('p.score','>',0)
                    ->whereColumn('p.player_id','r.player_id')->whereColumn('p.game_id','r.game_id')
                    ->whereColumn('p.rules_version','r.rules_version')
                    ->whereColumn('r.started_at','>=','w.starts_at')
                    ->whereColumn('r.started_at','<','w.ends_at');
            });
        $first=(clone $q)->min('r.started_at');
        if (!$first) return false;
        $next=CarbonImmutable::parse($first,'UTC')->setTimezone('Asia/Tehran')->startOfDay()->addDay()->utc();
        return (clone $q)->where('r.started_at','>=',$next->toDateTimeString())->exists();
    }

    public function evaluate(int $id): void
    {
        if (!$this->available()) return;
        DB::transaction(function () use ($id): void {
            $this->lock();
            $claim=DB::table('arcade_referrals')->where('id',$id)->lockForUpdate()->first();
            if (!$claim || $claim->status!=='pending') return;
            $update=fn (array $data)=>DB::table('arcade_referrals')->where('id',$id)->update(['checked_at'=>now()->utc(),...$data]);
            if (!$claim->inviter_id || $claim->expires_at<=now()->utc()->toDateTimeString()) {
                $update(['status'=>'expired']); return;
            }
            $update([]);
            if (CarbonImmutable::parse($claim->created_at,'UTC')->addDays(2)->isFuture()) return;
            $phones=app(PhoneIdentityService::class);
            $a=$phones->identity($claim->inviter_id); $b=$phones->identity($claim->player_id);
            if (!$a || !$b) return;
            if (hash_equals($a->phone_hash,$b->phone_hash) || $claim->inviter_id===$claim->player_id) {
                $update(['status'=>'review']); return;
            }
            $devices=DB::table('arcade_identity_devices')->where('last_seen','>=',now()->subDays(30));
            $one=(clone $devices)->where('player_id',$claim->inviter_id)->pluck('digest')->all();
            $two=(clone $devices)->where('player_id',$claim->player_id)->pluck('digest')->all();
            if (!$one || !$two) return;
            if (array_intersect($one,$two)) { $update(['status'=>'review']); return; }
            if (!$this->activity($claim->player_id,$b,$claim)) return;
            $month=now('Asia/Tehran')->format('Y-m');
            $inviter=$phones->digest('referral-inviter-v1',$month,$a->phone_hash);
            $invitee=$phones->digest('referral-invitee-v1',$b->phone_hash);
            $ledger=DB::table('arcade_referral_awards');
            if ((clone $ledger)->where('invitee_digest',$invitee)->exists()) {
                $update(['status'=>'review']); return;
            }
            $monthly=(clone $ledger)->where('month',$month);
            if ((clone $monthly)->count()>=self::MONTHLY_GLOBAL_CAP ||
                (clone $monthly)->where('inviter_digest',$inviter)->count()>=self::MONTHLY_INVITER_CAP) {
                $update(['status'=>'capped']); return;
            }
            $ledger->insert(['invitee_digest'=>$invitee,'inviter_digest'=>$inviter,'month'=>$month,
                'points'=>self::POINTS,'expires_at'=>now()->utc()->addDays(90)]);
            $update(['status'=>'qualified','points'=>self::POINTS,'qualified_at'=>now()->utc()]);
        },3);
    }

    public function sweep(): int
    {
        DB::table('arcade_referral_awards')->where('expires_at','<=',now()->utc())->delete();
        if (!$this->available()) return 0;
        $ids=DB::table('arcade_referrals')->where('status','pending')->orderBy('checked_at')->orderBy('id')->limit(100)->pluck('id');
        foreach ($ids as $id) $this->evaluate((int)$id);
        return $ids->count();
    }

    public function report(): array
    {
        $counts=DB::table('arcade_referrals')->selectRaw('status, COUNT(*) AS total')->groupBy('status')->pluck('total','status');
        $total=(int)$counts->sum();
        $qualified=(int)($counts['qualified']??0);
        $month=now('Asia/Tehran')->format('Y-m');
        return ['available'=>$this->available(),'registrations'=>$total,'qualified'=>$qualified,
            'pending'=>(int)($counts['pending']??0),'review'=>(int)($counts['review']??0),
            'expired'=>(int)($counts['expired']??0),'capped'=>(int)($counts['capped']??0),
            'conversion_percent'=>$total?round(100*$qualified/$total,2):0,
            'monthly_awards'=>DB::table('arcade_referral_awards')->where('month',$month)->count(),
            'monthly_cap'=>self::MONTHLY_GLOBAL_CAP,'financial_reward_cost'=>0,
            'total_acquisition_cost'=>null,'financial_rewards'=>false];
    }
}
