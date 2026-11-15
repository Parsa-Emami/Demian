<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

final class WeeklyAwardFinalizationService
{
    public function __construct(
        private readonly WeeklySettlementService $settlement,
        private readonly CouponIssuanceService $issuance,
        private readonly CouponPolicy $policy
    ) {}

    public function authorizedStart(): string
    {
        $start = config('demian-arcade.weekly_auto_award_from', '');
        if (! is_string($start) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $start)) {
            throw new RuntimeException('A reviewed Saturday rollout start date is required.');
        }
        $week = CarbonImmutable::createFromFormat('!Y-m-d', $start, 'Asia/Tehran');
        if (! $week || $week->format('Y-m-d') !== $start
            || $week->dayOfWeek !== CarbonImmutable::SATURDAY) {
            throw new RuntimeException('Rollout start must be a Tehran Saturday.');
        }

        return 'weekly:tehran:'.$start;
    }

    private function authorized(): string
    {
        if (config('demian-arcade.weekly_auto_awards_enabled') !== true
            || config('demian-arcade.weekly_management_enabled') !== true
            || config('demian-arcade.weekly_settlement_enabled') !== true
            || config('demian-coupons.auto_issue_enabled') !== true
            || config('demian-coupons.issue_enabled') !== true
            || config('demian-coupons.campaigns_enabled') !== true
            || config('demian-coupons.policy_approved') !== true) {
            throw new RuntimeException('Automatic weekly awards are disabled or not approved.');
        }
        $this->policy->approved();

        return $this->authorizedStart();
    }

    private function key(?string $week): ?string
    {
        if ($week === null) return null;
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $week)) {
            throw new InvalidArgumentException('Week must be a Tehran Saturday YYYY-MM-DD.');
        }
        $date = CarbonImmutable::createFromFormat('!Y-m-d', $week, 'Asia/Tehran');
        if (! $date || $date->format('Y-m-d') !== $week
            || $date->dayOfWeek !== CarbonImmutable::SATURDAY) {
            throw new InvalidArgumentException('Invalid Tehran Saturday.');
        }

        return 'weekly:tehran:'.$week;
    }

    private function candidates(CarbonImmutable $now, string $start,
        ?string $key, int $limit): array
    {
        $query = DB::table('arcade_weekly_periods as p')
            ->where('p.period_key', '>=', $start)
            ->where('p.completion_deadline_at', '<', $now->toDateTimeString())
            ->whereIn('p.status', ['open', 'sealed'])
            ->whereNotExists(function ($q): void {
                $q->selectRaw('1')->from('arcade_weekly_award_finalizations as f')
                    ->whereColumn('f.period_key', 'p.period_key');
            })
            ->orderBy('p.starts_at');
        if ($key !== null) $query->where('p.period_key', $key);

        return $query->limit($limit)->pluck('p.period_key')->all();
    }

    public function preview(?CarbonInterface $at = null, ?string $week = null,
        int $limit = 10): array
    {
        $now = $at ? CarbonImmutable::instance($at)->utc() : CarbonImmutable::now('UTC');
        $start = $this->authorizedStart();
        $key = $this->key($week);
        if ($key !== null && strcmp($key, $start) < 0) {
            throw new RuntimeException('Week precedes approved rollout start.');
        }
        $this->limit($limit);

        return [
            'mode' => 'read_only', 'server_time' => $now->toIso8601String(),
            'eligible_periods' => $this->candidates($now, $start, $key, $limit),
        ];
    }

    public function finalize(?CarbonInterface $at = null, ?string $week = null,
        int $limit = 10): array
    {
        $start = $this->authorized();
        $key = $this->key($week);
        if ($key !== null && strcmp($key, $start) < 0) {
            throw new RuntimeException('Week precedes approved rollout start.');
        }
        $this->limit($limit);
        $now = $at ? CarbonImmutable::instance($at)->utc() : CarbonImmutable::now('UTC');

        return DB::transaction(function () use ($now, $start, $key, $limit): array {
            $coordinator = DB::table('arcade_weekly_award_coordinator')
                ->where('id', 1)->lockForUpdate()->first();
            if (! $coordinator) {
                throw new RuntimeException('Weekly award coordinator lock is not provisioned.');
            }

            $pending = $this->candidates($now, $start, $key, $limit);
            $completed = [];
            $blocked = null;
            foreach ($pending as $periodKey) {
                try {
                    $completed[] = DB::transaction(
                        fn (): array => $this->finalizeOne($periodKey, $now),
                        1
                    );
                } catch (\Throwable $error) {
                    $blocked = [
                        'period_key' => $periodKey,
                        'error' => $error->getMessage(),
                    ];
                    break;
                }
            }

            return [
                'status' => $blocked ? 'blocked' : 'ok',
                'completed' => $completed, 'blocked' => $blocked,
            ];
        }, 3);
    }

    private function finalizeOne(string $key, CarbonImmutable $now): array
    {
        $period = DB::table('arcade_weekly_periods')
            ->where('period_key', $key)->lockForUpdate()->first();
        if (! $period || ! in_array($period->status, ['open', 'sealed'], true)
            || ! $period->completion_deadline_at
            || $now->lte(CarbonImmutable::parse($period->completion_deadline_at, 'UTC'))) {
            throw new RuntimeException('Weekly replay completion deadline has not elapsed.');
        }
        if (DB::table('arcade_weekly_award_finalizations')
            ->where('period_key', $key)->exists()) {
            throw new RuntimeException('Weekly awards already finalized by another operation.');
        }
        $unfinalizedEarlier = DB::table('arcade_weekly_periods as earlier')
            ->where('earlier.period_key', '>=', $this->authorizedStart())
            ->where('earlier.period_key', '<', $key)
            ->where('earlier.completion_deadline_at', '<', $now->toDateTimeString())
            ->whereNotExists(function ($query): void {
                $query->selectRaw('1')->from('arcade_weekly_award_finalizations as f')
                    ->whereColumn('f.period_key', 'earlier.period_key');
            })->exists();
        if ($unfinalizedEarlier) {
            throw new RuntimeException('Prior eligible weeks must be finalized first.');
        }

        if ($period->status === 'open') {
            $week = substr($key, strlen('weekly:tehran:'));
            $this->settlement->seal($week, $now);
        }

        $sealed = DB::table('arcade_weekly_periods')
            ->where('period_key', $key)->lockForUpdate()->first();
        if ($sealed->status !== 'sealed' || ! $sealed->sealed_at
            || ! preg_match('/^[a-f0-9]{64}$/D', (string) $sealed->snapshot_hash)) {
            throw new RuntimeException('Missing sealed immutable weekly snapshot.');
        }

        $count = (int) $sealed->winner_count;
        $campaignId = null;
        $created = 0;
        if ($count > 0) {
            $issued = $this->issuance->issueWeek($key);
            if ($issued['created'] + $issued['existing'] !== $count) {
                throw new RuntimeException('Not every verified winner has a unique coupon.');
            }
            $created = (int) $issued['created'];
            $campaignId = DB::table('arcade_reward_campaigns')
                ->where('period_key', $key)->value('id');
        }
        $coupons = DB::table('arcade_coupons as c')
            ->join('arcade_weekly_winners as w', 'w.id', '=', 'c.winner_id')
            ->where('w.period_key', $key)->count();
        if ($coupons !== $count) {
            throw new RuntimeException('Finalization coupon ledger count mismatch.');
        }

        DB::table('arcade_weekly_award_finalizations')->insert([
            'period_key' => $key, 'snapshot_hash' => $sealed->snapshot_hash,
            'winner_count' => $count, 'coupon_count' => $coupons,
            'campaign_id' => $campaignId,
            'finalized_at' => $now->toDateTimeString(),
        ]);
        DB::table('arcade_weekly_settlement_events')->insert([
            'period_key' => $key, 'event_type' => 'automatic_awards_finalized',
            'details' => json_encode([
                'snapshot_hash' => $sealed->snapshot_hash,
                'winners' => $count, 'coupons' => $coupons,
                'campaign_id' => $campaignId,
            ], JSON_THROW_ON_ERROR),
            'created_at' => $now->toDateTimeString(),
        ]);

        return [
            'period_key' => $key, 'status' => 'finalized',
            'winners' => $count, 'created' => $created,
            'snapshot_hash' => $sealed->snapshot_hash,
        ];
    }

    private function limit(int $value): void
    {
        if ($value < 1 || $value > 26) {
            throw new InvalidArgumentException('Batch limit must be 1–26.');
        }
    }
}
