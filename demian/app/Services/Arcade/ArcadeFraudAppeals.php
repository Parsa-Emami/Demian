<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/** First-class, authenticated appeals; no heuristic is itself a conviction. */
final class ArcadeFraudAppeals
{
    public const REASONS = ['shared_device', 'shared_network', 'replay_dispute',
        'false_positive', 'other'];

    public function submit(ArcadePlayer $player, int $reportId, string $reason,
        string $statement): array
    {
        abort_unless(in_array($reason, self::REASONS, true)
            && mb_strlen(trim($statement)) >= 12
            && mb_strlen($statement) <= 350, 422);
        return DB::transaction(function () use ($player, $reportId, $reason, $statement): array {
            ArcadePlayer::query()->whereKey($player->id)->lockForUpdate()->firstOrFail();
            $report = DB::table('arcade_cheat_reports')
                ->where('id', $reportId)->lockForUpdate()->first();
            // A player must never discover another account's report ID.
            abort_unless($report && $report->player_id === $player->id, 404);
            abort_unless(in_array($report->status, ['investigating', 'confirmed'], true),
                409, 'Only cases under review or confirmed cases may be appealed.');
            $existing = DB::table('arcade_cheat_appeals')
                ->where('report_id', $reportId)->where('player_id', $player->id)->first();
            if ($existing) return ['appeal_id' => $existing->id,
                'status' => $existing->status, 'duplicate' => true];
            $id = DB::table('arcade_cheat_appeals')->insertGetId([
                'report_id' => $reportId, 'player_id' => $player->id,
                'reason_code' => $reason,
                'statement_ciphertext' => Crypt::encryptString(trim($statement)),
                'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('arcade_cheat_review_events')->insert([
                'report_id' => $reportId, 'actor_id' => null,
                'action' => 'player_appealed', 'previous_status' => $report->status,
                'next_status' => $report->status,
                'note' => 'Player filed a protected appeal (no narrative in event log).',
                'created_at' => now(),
            ]);
            return ['appeal_id' => $id, 'status' => 'open', 'duplicate' => false];
        }, 3);
    }

    public function forPlayer(ArcadePlayer $player): array
    {
        return DB::table('arcade_cheat_appeals')->where('player_id', $player->id)
            ->orderByDesc('id')->limit(50)->get([
                'id', 'report_id', 'reason_code', 'status', 'created_at', 'reviewed_at',
            ])->toArray();
    }

    public function resolve(int $appealId, int $staffId, int $sessionVersion,
        string $decision, string $note): array
    {
        if (! in_array($decision, ['accept', 'reject'], true)
            || mb_strlen(trim($note)) < 12 || mb_strlen($note) > 500) {
            throw new \InvalidArgumentException('Invalid appeal decision or note.');
        }
        return DB::transaction(function () use ($appealId, $staffId, $sessionVersion,
            $decision, $note): array {
            $staff = DB::table('arcade_cashier_staff')
                ->where('id', $staffId)->lockForUpdate()->first();
            CafeAccess::authorize($staff, 'audit.ledger');
            abort_unless($staff->role === 'super_admin'
                && (int) $staff->session_version === $sessionVersion, 403);
            $appeal = DB::table('arcade_cheat_appeals')
                ->where('id', $appealId)->lockForUpdate()->first();
            abort_unless($appeal, 404);
            abort_unless($appeal->status === 'open', 409, 'Appeal already handled.');
            $report = DB::table('arcade_cheat_reports')
                ->where('id', $appeal->report_id)->lockForUpdate()->first();
            abort_unless($report && $report->player_id === $appeal->player_id, 409,
                'Appeal no longer matches a report.');
            if ($decision === 'accept') {
                // Never clear a case while a human-applied restriction persists.
                abort_if(DB::table('arcade_anticheat_holds')
                    ->where('report_id', $report->id)
                    ->where('expires_at', '>', now())->exists(), 409,
                    'Release the manual hold first.');
                DB::table('arcade_cheat_reports')->where('id', $report->id)->update([
                    'status' => 'cleared', 'reviewed_by' => $staffId,
                    'reviewed_at' => now(), 'updated_at' => now(),
                ]);
            }
            $status = $decision === 'accept' ? 'accepted' : 'rejected';
            DB::table('arcade_cheat_appeals')->where('id', $appealId)->update([
                'status' => $status, 'reviewed_by' => $staffId,
                'resolution_note' => trim($note),
                'reviewed_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('arcade_cheat_review_events')->insert([
                'report_id' => $report->id, 'actor_id' => $staffId,
                'action' => 'appeal_'.$status,
                'previous_status' => $report->status,
                'next_status' => $decision === 'accept' ? 'cleared' : $report->status,
                'note' => trim($note), 'created_at' => now(),
            ]);
            return ['appeal_id' => $appealId, 'status' => $status];
        }, 3);
    }

    public function adminQueue(): array
    {
        return DB::table('arcade_cheat_appeals')->orderByDesc('id')->limit(30)
            ->get()->map(static function ($row): array {
                try { $statement = Crypt::decryptString($row->statement_ciphertext); }
                catch (\Throwable) { $statement = '[unreadable encrypted statement]'; }
                return ['id' => $row->id, 'report_id' => $row->report_id,
                    'reason_code' => $row->reason_code, 'statement' => $statement,
                    'status' => $row->status, 'created_at' => $row->created_at];
            })->all();
    }
}
