<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Domain\Shared\Clock;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class BusinessAnalytics
{
    public const WINDOWS = [7, 30, 90];

    public function __construct(private readonly Clock $clock, private readonly RetentionReport $retention) {}

    private function within($query, string $column, CarbonImmutable $from, CarbonImmutable $to)
    {
        return $query->where($column, '>=', $from->utc()->toDateTimeString())
            ->where($column, '<', $to->utc()->toDateTimeString());
    }

    private function runs(CarbonImmutable $from, CarbonImmutable $to, ?CarbonImmutable $completionCutoff = null)
    {
        return $this->within(DB::table('arcade_runs'), 'started_at', $from, $to)
            ->where('status', 'verified')->whereNotNull('replay_hash')->whereNotNull('completed_at')
            ->where('completed_at', '<', ($completionCutoff ?? $to)->utc()->toDateTimeString());
    }

    private function ratio(int $n, int $d): ?float
    {
        return $d > 0 ? round(100 * $n / $d, 2) : null;
    }

    private function money(CarbonImmutable $from, CarbonImmutable $to): array
    {
        return $this->within(DB::table('arcade_coupon_redemptions')->where('channel', 'in_cafe'), 'redeemed_at', $from, $to)
            ->select('currency')->selectRaw('COUNT(*) AS receipts, SUM(subtotal_minor) AS gross, SUM(discount_minor) AS discount')
            ->groupBy('currency')->orderBy('currency')->get()->map(static function ($r): array {
                return ['currency' => $r->currency, 'receipts' => (int) $r->receipts, 'gross_minor' => (int) $r->gross,
                    'discount_minor' => (int) $r->discount, 'net_minor' => (int) $r->gross - (int) $r->discount];
            })->all();
    }

    private function acquisition(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $players = $this->within(DB::table('arcade_players'), 'created_at', $from, $to);
        $new = (int) (clone $players)->count();
        $verified = (clone $players)->where('contact_type', 'phone')->whereNotNull('contact_hash')
            ->whereNotNull('phone_verified_at')->where('phone_verified_at', '<', $to->utc())->count();
        $attributed = $this->within(DB::table('arcade_referrals'), 'created_at', $from, $to);
        $attributions = (int) (clone $attributed)->count();
        $qualified = (int) (clone $attributed)->where('status', 'qualified')
            ->whereNotNull('qualified_at')->where('qualified_at', '<', $to->utc()->toDateTimeString())->count();
        $played = (int) $this->runs($from, $to)->whereIn('player_id', (clone $players)->select('id'))->distinct()->count('player_id');

        return ['registrations' => $new, 'verified_registrations' => (int) $verified, 'new_players_with_verified_run' => $played,
            'registration_verification_percent' => $this->ratio((int) $verified, $new),
            'registration_activation_percent' => $this->ratio($played, $new), 'referral_registrations' => $attributions,
            'qualified_referrals' => $qualified, 'referral_conversion_percent' => $this->ratio($qualified, $attributions)];
    }

    private function couponCohort(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $issued = $this->within(DB::table('arcade_coupons'), 'issued_at', $from, $to);
        $total = (int) (clone $issued)->count();
        $used = (int) (clone $issued)->join('arcade_coupon_redemptions as r', 'r.coupon_id', '=', 'arcade_coupons.id')
            ->where('r.channel', 'in_cafe')->where('r.redeemed_at', '<', $to->utc()->toDateTimeString())->count();

        return ['issued' => $total, 'redeemed_in_cafe_before_cutoff' => $used, 'redemption_percent' => $this->ratio($used, $total)];
    }

    private function engagement(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $runs = $this->runs($from, $to);
        $summary = (clone $runs)->selectRaw('COUNT(*) AS runs, COUNT(DISTINCT player_id) AS players')->first();
        $games = (clone $runs)->select('game_id')->selectRaw('COUNT(*) AS runs, COUNT(DISTINCT player_id) AS players')
            ->groupBy('game_id')->orderBy('game_id')->get()->map(static fn ($r) => [
                'game_id' => $r->game_id, 'runs' => (int) $r->runs, 'players' => (int) $r->players])->all();

        return ['verified_runs' => (int) $summary->runs, 'active_players' => (int) $summary->players,
            'runs_per_active_player' => $summary->players > 0 ? round((int) $summary->runs / (int) $summary->players, 2) : null,
            'games' => $games];
    }

    private function weightedRetention(int $days): array
    {
        $report = $this->retention->snapshot($days, true);
        $result = ['status' => $report['status'], 'players' => $report['players'], 'cohorts' => [], 'rates' => []];
        if ($report['truncated']) {
            foreach (['d1', 'd7', 'd30'] as $field) {
                $result['rates'][$field] = null;
            }

            return $result;
        }
        $result['cohorts'] = $report['cohorts'];
        foreach (['d1', 'd7', 'd30'] as $field) {
            $eligible = 0;
            $returned = 0;
            foreach ($report['cohorts'] as $row) {
                $eligible += (int) ($row[$field]['eligible'] ?? 0);
                $returned += (int) ($row[$field]['returned'] ?? 0);
            }
            $result['rates'][$field] = ['eligible' => $eligible, 'returned' => $returned,
                'percent' => $this->ratio($returned, $eligible)];
        }

        return $result;
    }

    public function snapshot(int $days): array
    {
        if (! in_array($days, self::WINDOWS, true)) {
            throw new InvalidArgumentException('Unsupported analytics window.');
        }
        $to = CarbonImmutable::instance($this->clock->now())->setTimezone('Asia/Tehran')->startOfDay();
        $from = $to->subDays($days);
        $engagement = $this->engagement($from, $to);
        $trend = [];
        for ($start = $from; $start->lt($to); $start = $end) {
            $end = $start->addDays(7)->min($to);
            $q = $this->runs($start, $end, $to);
            $row = $q->selectRaw('COUNT(*) AS runs, COUNT(DISTINCT player_id) AS players')->first();
            $trend[] = ['from' => $start->toDateString(), 'until_exclusive' => $end->toDateString(),
                'registrations' => $this->within(DB::table('arcade_players'), 'created_at', $start, $end)->count(),
                'active_players' => (int) $row->players, 'verified_runs' => (int) $row->runs];
        }
        $month = $to->format('Y-m');
        $monthAwards = (int) DB::table('arcade_referral_awards')->where('month', $month)
            ->where('expires_at', '>', CarbonImmutable::instance($this->clock->now())->utc()->toDateTimeString())->count();
        $cost = DB::table('arcade_referral_costs')->where('month', $month)->value('spend_irr');

        return [
            'schema' => 1, 'timezone' => 'Asia/Tehran', 'days' => $days, 'from' => $from->toDateString(),
            'until_exclusive' => $to->toDateString(), 'generated_at' => CarbonImmutable::instance($this->clock->now())->utc()->toIso8601String(),
            'acquisition' => $this->acquisition($from, $to), 'engagement' => $engagement,
            'wau' => $this->runs($to->subDays(7), $to)->distinct()->count('player_id'),
            'mau' => $this->runs($to->subDays(30), $to)->distinct()->count('player_id'),
            'retention' => $this->weightedRetention($days), 'coupon_cohort' => $this->couponCohort($from, $to),
            'cafe_receipts' => $this->money($from,$to), 'trend' => $trend,
            'referral_month_live' => ['month' => $month, 'recorded_spend_irr' => $cost === null ? null : (int) $cost,
                'award_count' => $monthAwards, 'cac_irr' => $cost === null || $monthAwards === 0 ? null : intdiv((int) $cost,$monthAwards)],
        ];
    }
}
