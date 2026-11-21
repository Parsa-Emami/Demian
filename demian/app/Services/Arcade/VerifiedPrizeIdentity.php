<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class VerifiedPrizeIdentity
{
    public const POLICY = 'verified-phone-weekly-v1';

    private function scoped(string $week, string $hash): string
    {
        return app(PhoneIdentityService::class)->digest('weekly-award-v1', $week, $hash);
    }

    /** Preserve original technical ranking, but count only verified identities
     * for financial participation; retain prior claim even after erasure. */
    public function eligibility(string $week, array $rankings, array $historical, array $excluded, bool $lock = false): array
    {
        $ids = [];
        foreach ($rankings as $rows) foreach ($rows as $row) $ids[$row['player_id']] = true;
        $verified = [];
        foreach (array_chunk(array_keys($ids), 500) as $chunk) {
            $query = DB::table('arcade_verified_phones')->whereIn('player_id', $chunk)->orderBy('player_id');
            if ($lock) $query->lockForUpdate();
            foreach ($query->get(['player_id', 'phone_hash']) as $identity) $verified[$identity->player_id] = $identity->phone_hash;
        }
        $recent = DB::table('arcade_identity_awards')->where('period_key', '<=', $week)
            ->where('expires_at', '>', now())->get(['period_key', 'identity_digest', 'blocked_until']);
        $claims = [];
        foreach ($recent as $claim) $claims[$claim->period_key][$claim->identity_digest] = $claim->blocked_until;
        foreach ($verified as $player => $hash) {
            foreach ($claims as $period => $digests) {
                $digest = $this->scoped($period, $hash);
                if (! isset($digests[$digest])) continue;
                if ($period < $week) $historical[] = $player;
                if ($period === $week || $digests[$digest] > now()->utc()->toDateTimeString()) $excluded[] = $player;
            }
        }
        return ['verified_ids' => array_keys($verified), 'historical' => array_values(array_unique($historical)),
            'excluded' => array_values(array_unique([...$excluded, ...array_keys(array_diff_key($ids, $verified))]))];
    }

    private function verifiedHash(string $player, bool $lock): string
    {
        $query = DB::table('arcade_verified_phones')->where('player_id', $player);
        if ($lock) $query->lockForUpdate();
        $identity = $query->first();
        if (! $identity) throw new RuntimeException('Award requires a verified phone identity.');
        $service = app(PhoneIdentityService::class);
        if (! hash_equals($identity->phone_hash, $service->digest('phone-v1', Crypt::decryptString($identity->phone_ciphertext)))) {
            throw new RuntimeException('Verified identity integrity mismatch.');
        }
        return $identity->phone_hash;
    }

    /** Called once, inside the existing period-locked settlement transaction. */
    public function seal(string $week, \Carbon\CarbonImmutable $at): void
    {
        $winners = DB::table('arcade_weekly_winners')->where('period_key', $week)->orderBy('id')->get();
        foreach ($winners as $winner) {
            $hash = $this->verifiedHash($winner->player_id, true);
            $inserted = DB::table('arcade_identity_awards')->insertOrIgnore([
                'period_key' => $week, 'identity_digest' => $this->scoped($week, $hash),
                'winner_id' => $winner->id, 'blocked_until' => $at->addDays(CouponPolicy::WEEKLY_VALID_DAYS)->toDateTimeString(),
                'expires_at' => $at->addDays(28)->toDateTimeString(),
            ]);
            if ($inserted !== 1) throw new RuntimeException('Duplicate weekly verified identity claim; settlement rolled back.');
        }
    }

    public function assertNewAward(object $winner, object $period, ?object $campaign): void
    {
        $terms = $campaign ? json_decode($campaign->terms, true, 512, JSON_THROW_ON_ERROR) : [];
        $policy = $terms['identity_policy'] ?? null;
        if ($policy !== self::POLICY && ! app(PhoneIdentityService::class)->required()) return;
        if ($policy !== self::POLICY) throw new RuntimeException('Verified identity policy not frozen; reconcile legacy awards before issuance.');
        if (! app(PhoneIdentityService::class)->ready()) throw new RuntimeException('Verified identity service not ready for new awards.');
        if (\Carbon\CarbonImmutable::parse($period->sealed_at, 'UTC')->addDays(CouponPolicy::WEEKLY_VALID_DAYS)->lte(now())) {
            throw new RuntimeException('New award voucher validity window already elapsed.');
        }
        $hash = $this->verifiedHash($winner->player_id, true);
        $claim = DB::table('arcade_identity_awards')->where('winner_id', $winner->id)
            ->where('period_key', $winner->period_key)->first();
        if (! $claim || ! hash_equals($claim->identity_digest, $this->scoped($winner->period_key, $hash))) {
            throw new RuntimeException('Verified weekly identity claim missing or mismatched.');
        }
    }
}
