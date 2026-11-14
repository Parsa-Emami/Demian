<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use App\Models\ArcadeRun;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Phase 2, Step 10: reviewable, privacy-preserving heuristic detections.
 *
 * This service cannot delete a verified score, alter leaderboard placement,
 * issue/revoke coupons, or automatically suspend a player. Detection produces
 * a deduplicated evidence report. A separate step-up-authenticated cafe
 * superadministrator must confirm fraud and explicitly request a temporary
 * NEW-run-only hold.
 */
final class ArcadeAntiCheat
{
    private const SIGNALS = [
        'start_velocity' => ['risk' => 45, 'severity' => 'medium'],
        'invalid_replay_velocity' => ['risk' => 60, 'severity' => 'high'],
        'shared_network_cohort' => ['risk' => 35, 'severity' => 'medium'],
        'cross_account_replay' => ['risk' => 75, 'severity' => 'high'],
        'statistical_score_outlier' => ['risk' => 40, 'severity' => 'medium'],
        'short_high_score' => ['risk' => 45, 'severity' => 'medium'],
        'dense_control_trace' => ['risk' => 25, 'severity' => 'low'],
    ];

    public function enabled(): bool
    {
        return config('demian-arcade.anticheat.enabled') === true;
    }

    private function setting(string $name, int $default): int
    {
        return max(1, (int) config('demian-arcade.anticheat.'.$name, $default));
    }

    /**
     * Daily-rotating one-way network fingerprint. Never persist raw IPs, user
     * agents or client authorization values. App secret is not exposed to UI.
     */
    private function networkDigest(?string $ip): ?string
    {
        if (! is_string($ip) || filter_var($ip, FILTER_VALIDATE_IP) === false) {
            return null;
        }
        $secret = (string) config('app.key', '');
        if (strlen($secret) < 24) {
            throw new RuntimeException('Anti-cheat needs a configured application secret.');
        }
        return hash_hmac('sha256', now('UTC')->format('Y-m-d').'|'.$ip, $secret);
    }

    /**
     * Observations are deliberately small, allowlisted and never store a
     * submitted payload, replay bytes or even an untrusted error message.
     */
    private function observe(
        string $event, ?string $playerId, ?string $runId, ?string $game,
        ?int $score, ?int $httpStatus, ?string $ip
    ): ?string {
        $digest = $this->networkDigest($ip);
        DB::table('arcade_anticheat_observations')->insert([
            'player_id' => $playerId, 'run_id' => $runId,
            'event_code' => $event, 'ip_digest' => $digest,
            'http_status' => $httpStatus, 'game_id' => $game,
            'score' => $score, 'created_at' => now(),
        ]);
        return $digest;
    }

    /**
     * Idempotent report identity: player + signal + run or time window.
     * Only internal numeric counts and approved code strings enter evidence.
     */
    private function signal(
        string $kind, string $playerId, ?string $runId, string $scope,
        array $evidence
    ): void {
        $policy = self::SIGNALS[$kind] ?? null;
        if (! $policy) throw new \LogicException('Unknown anti-cheat signal.');
        $secret = (string) config('app.key');
        $fingerprint = hash_hmac('sha256',
            implode('|', [$kind, $playerId, $runId ?? '-', $scope]), $secret);
        $created = DB::table('arcade_cheat_reports')->insertOrIgnore([
            'player_id' => $playerId, 'run_id' => $runId,
            'fingerprint' => $fingerprint, 'signal' => $kind,
            'risk_score' => $policy['risk'], 'severity' => $policy['severity'],
            'status' => 'open', 'evidence' => json_encode($evidence, JSON_THROW_ON_ERROR),
            'hits' => 1, 'first_seen' => now(), 'last_seen' => now(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        if ($created === 0) {
            // A dismissed report is not silently reopened by the same signal;
            // the operator may intentionally reopen it with a review event.
            DB::table('arcade_cheat_reports')->where('fingerprint', $fingerprint)
                ->update(['hits' => DB::raw('hits + 1'), 'last_seen' => now(),
                    'updated_at' => now()]);
        }
    }

    public function assertStartAllowed(string $playerId): void
    {
        if (! $this->enabled()) return;
        abort_unless(! DB::table('arcade_anticheat_holds')
            ->where('player_id', $playerId)
            ->where('expires_at', '>', now())->exists(),
            423, 'New ranked runs temporarily restricted by human-reviewed decision.');
    }

    /**
     * Must run only for a NEW server-generated run inside the existing
     * player-row-locked transaction. An idempotent start isn't a new event.
     */
    public function started(ArcadeRun $run, ?string $ip = null): void
    {
        if (! $this->enabled()) return;
        $digest = $this->observe('start', $run->player_id, $run->id,
            $run->game_id, null, null, $ip);
        $minutes = $this->setting('start_burst_minutes', 10);
        $count = DB::table('arcade_anticheat_observations')
            ->where('player_id', $run->player_id)->where('event_code', 'start')
            ->where('created_at', '>=', now()->subMinutes($minutes))->count();
        if ($count >= $this->setting('start_burst_count', 10)) {
            $this->signal('start_velocity', $run->player_id, null,
                now('UTC')->format('Y-m-d-H'), [
                    'starts' => $count, 'window_minutes' => $minutes,
                ]);
        }
        if ($digest !== null) {
            $minutes = $this->setting('ip_cohort_minutes', 30);
            $accounts = DB::table('arcade_anticheat_observations')
                ->where('ip_digest', $digest)->where('event_code', 'start')
                ->where('created_at', '>=', now()->subMinutes($minutes))
                ->distinct()->count('player_id');
            if ($accounts >= $this->setting('ip_cohort_accounts', 12)) {
                // Cafe guest Wi-Fi and carrier NAT are common. This is a
                // review signal only, never a shared-IP account ban.
                $this->signal('shared_network_cohort', $run->player_id, null,
                    now('UTC')->format('Y-m-d-H'), [
                    'accounts' => $accounts, 'window_minutes' => $minutes,
                    'network_kind' => 'daily_hmac', // not the HMAC itself
                ]);
            }
        }
    }

    /**
     * Server-computed score/seed only; client score is never an input.
     * Called in the same transaction as immutable replay persistence.
     */
    public function verified(ArcadeRun $run, int $inputCount, ?string $ip = null): void
    {
        if (! $this->enabled()) return;
        $this->observe('verified', $run->player_id, $run->id,
            $run->game_id, (int) $run->score, null, $ip);
        $previous = DB::table('arcade_runs')
            ->where('game_id', $run->game_id)
            ->where('rules_version', $run->rules_version)
            ->where('status', 'verified')->where('id', '<>', $run->id)
            ->where('completed_at', '>=', now()->subDays(
                $this->setting('replay_clone_days', 7)));
        $clone = (clone $previous)->where('replay_hash', $run->replay_hash)
            ->where('player_id', '<>', $run->player_id)->exists();
        if ($clone) {
            $this->signal('cross_account_replay', $run->player_id, $run->id,
                'immutable-v1', ['game' => $run->game_id,
                    'rules_version' => $run->rules_version,
                    'same_input_digest' => true]);
        }

        // A single excellent score is not intrinsically fraud. Require a
        // representative history and use only coarse, deterministic limits.
        $history = (clone $previous)->orderByDesc('completed_at')->limit(300)
            ->pluck('score')->map(static fn ($n): int => (int) $n)->all();
        sort($history, SORT_NUMERIC);
        if (count($history) >= $this->setting('score_outlier_min_history', 20)) {
            $median = $history[intdiv(count($history), 2)];
            $ratio = $this->setting('score_outlier_ratio', 4);
            if ((int) $run->score >= max(500, $median * $ratio + 100)) {
                $this->signal('statistical_score_outlier', $run->player_id,
                    $run->id, 'rules-v1', [
                        'score' => (int) $run->score,
                        'baseline_median' => $median,
                        'sample_size' => count($history), 'ratio_threshold' => $ratio,
                    ]);
            }
        }
        if ((int) $run->ticks <= 600 && (int) $run->score >= 1000) {
            $this->signal('short_high_score', $run->player_id, $run->id,
                'rules-v1', ['score' => (int) $run->score,
                    'ticks' => (int) $run->ticks, 'tick_rate' => 60]);
        }
        if ($run->ticks >= 600 && $inputCount / $run->ticks >= .85) {
            $this->signal('dense_control_trace', $run->player_id, $run->id,
                'rules-v1', ['input_events' => $inputCount,
                    'ticks' => (int) $run->ticks]);
        }
    }

    /** Run only after the HTTP response has a final 409/410/422 outcome. */
    public function rejected(ArcadePlayer $player, ?ArcadeRun $run,
        int $status, ?string $ip = null): void
    {
        if (! $this->enabled() || ! in_array($status, [409, 410, 422], true)) return;
        $runId = $run?->player_id === $player->id ? $run?->id : null;
        $game = $runId ? $run->game_id : null;
        $this->observe('rejected', $player->id, $runId,
            $game, null, $status, $ip);
        $minutes = $this->setting('rejection_burst_minutes', 15);
        $count = DB::table('arcade_anticheat_observations')
            ->where('player_id', $player->id)
            ->where('event_code', 'rejected')
            ->where('created_at', '>=', now()->subMinutes($minutes))->count();
        if ($count >= $this->setting('rejection_burst_count', 4)) {
            $this->signal('invalid_replay_velocity', $player->id, null,
                now('UTC')->format('Y-m-d-H'), [
                    'rejections' => $count, 'window_minutes' => $minutes,
                    'http_status' => $status,
                ]);
        }
    }

    /** Strong, persistent staff session check. Never grant via player token. */
    private function authorizeSuperadmin(int $actorId, int $sessionVersion): object
    {
        $staff = DB::table('arcade_cashier_staff')
            ->where('id', $actorId)->lockForUpdate()->first();
        CafeAccess::authorize($staff, 'audit.ledger');
        abort_unless($staff->role === 'super_admin'
            && (int) $staff->session_version === $sessionVersion, 403,
            'Anti-cheat actions require an active, current superadministrator session.');
        return $staff;
    }

    /**
     * Manual decisions are journaled in append-only review events.
     * A "confirmed" report has NO automatic impact on rankings or coupons.
     */
    public function review(
        int $reportId, int $actorId, int $sessionVersion,
        string $decision, string $note
    ): array {
        $states = ['investigating', 'cleared', 'confirmed', 'reopen'];
        if (! in_array($decision, $states, true)
            || mb_strlen(trim($note)) < 12 || mb_strlen($note) > 500) {
            throw new \InvalidArgumentException('Invalid human review decision or reason.');
        }
        return DB::transaction(function () use ($reportId, $actorId,
            $sessionVersion, $decision, $note): array {
            $this->authorizeSuperadmin($actorId, $sessionVersion);
            $report = DB::table('arcade_cheat_reports')
                ->where('id', $reportId)->lockForUpdate()->first();
            abort_unless($report, 404);
            $terminal = in_array($report->status, ['cleared','confirmed'], true);
            abort_unless(($decision === 'reopen') === $terminal, 409,
                'Invalid review transition.');
            abort_if($decision === 'investigating'
                && $report->status === 'investigating', 409, 'Already under review.');
            $next = $decision === 'reopen' ? 'open' : $decision;
            DB::table('arcade_cheat_reports')->where('id', $reportId)->update([
                'status' => $next, 'reviewed_by' => $actorId,
                'reviewed_at' => now(), 'updated_at' => now(),
            ]);
            $this->journal($reportId, $actorId, 'review',
                $report->status, $next, trim($note));
            return ['report_id' => $reportId, 'status' => $next];
        }, 3);
    }

    public function setHold(
        int $reportId, int $actorId, int $sessionVersion,
        ?int $hours, string $note
    ): array {
        if (($hours !== null && ($hours < 1 || $hours > 168))
            || mb_strlen(trim($note)) < 12 || mb_strlen($note) > 500) {
            throw new \InvalidArgumentException('Invalid hold duration or reason.');
        }
        return DB::transaction(function () use ($reportId, $actorId,
            $sessionVersion, $hours, $note): array {
            $this->authorizeSuperadmin($actorId, $sessionVersion);
            $report = DB::table('arcade_cheat_reports')
                ->where('id', $reportId)->lockForUpdate()->first();
            abort_unless($report && $report->player_id, 404);
            if ($hours !== null) {
                abort_unless($report->status === 'confirmed', 409,
                    'A reviewer must confirm the report before restricting starts.');
            }
            // Run starts lock this same player row before checking an active hold.
            ArcadePlayer::query()->whereKey($report->player_id)
                ->lockForUpdate()->firstOrFail();
            if ($hours === null) {
                DB::table('arcade_anticheat_holds')
                    ->where('player_id', $report->player_id)->delete();
                $action = 'hold_released';
                $expires = null;
            } else {
                $expires = now()->addHours($hours);
                DB::table('arcade_anticheat_holds')->updateOrInsert(
                    ['player_id' => $report->player_id], [
                        'report_id' => $reportId, 'actor_id' => $actorId,
                        'expires_at' => $expires, 'updated_at' => now(),
                        'created_at' => now(),
                    ]);
                $action = 'hold_applied';
            }
            $this->journal($reportId, $actorId, $action,
                $report->status, $report->status, trim($note));
            return ['report_id' => $reportId, 'status' => $action,
                'expires_at' => $expires?->toIso8601String()];
        }, 3);
    }

    private function journal(int $reportId, int $actorId, string $action,
        ?string $old, ?string $new, string $note): void
    {
        DB::table('arcade_cheat_review_events')->insert([
            'report_id' => $reportId, 'actor_id' => $actorId,
            'action' => $action, 'previous_status' => $old,
            'next_status' => $new, 'note' => $note, 'created_at' => now(),
        ]);
    }

    public function dashboard(): array
    {
        $total = DB::table('arcade_cheat_reports');
        return [
            'enabled' => $this->enabled(),
            'unresolved' => (clone $total)->whereIn('status',
                ['open','investigating'])->count(),
            'high_priority' => (clone $total)->whereIn('status',
                ['open','investigating'])->where('severity', 'high')->count(),
            'confirmed' => (clone $total)->where('status', 'confirmed')->count(),
            'observations_24h' => DB::table('arcade_anticheat_observations')
                ->where('created_at','>=',now()->subDay())->count(),
            'rejections_24h' => DB::table('arcade_anticheat_observations')
                ->where('event_code','rejected')
                ->where('created_at','>=',now()->subDay())->count(),
            'active_holds' => DB::table('arcade_anticheat_holds')
                ->where('expires_at','>',now())->count(),
        ];
    }

    public function prune(): array
    {
        $days = $this->setting('observation_retention_days', 30);
        return [
            'observations' => DB::table('arcade_anticheat_observations')
                ->where('created_at','<',now()->subDays($days))->delete(),
            'expired_holds' => DB::table('arcade_anticheat_holds')
                ->where('expires_at','<=',now())->delete(),
        ];
    }
}
