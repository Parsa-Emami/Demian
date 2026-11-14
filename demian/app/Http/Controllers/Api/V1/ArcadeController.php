<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\CompleteArcadeRunRequest;
use App\Http\Requests\StartArcadeRunRequest;
use App\Models\ArcadePlayer;
use App\Models\ArcadeRun;
use App\Services\Arcade\ArcadeRunService;
use App\Services\Arcade\LeaderboardService;
use App\Services\Arcade\CompetitionClock;
use App\Services\Arcade\RankedGameCatalog;
use App\Services\Arcade\RunnerReplayVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

final class ArcadeController extends Controller
{
    private function name(Request $request): string
    {
        $name = $request->input('display_name');
        if (is_string($name)) $request->merge(['display_name' => trim($name)]);

        return $request->validate(['display_name' => ['required', 'string', 'min:2', 'max:32', 'regex:/^[\pL\pN _\-\x{200C}]+$/u']])['display_name'];
    }

    public function rules(RunnerReplayVerifier $verifier, RankedGameCatalog $catalog, CompetitionClock $clock): JsonResponse
    {
        return response()->json(['game_id' => 'dino-run', 'rules' => $verifier->rules(),
            'characters' => config('demian-arcade.characters'),
            'games' => $catalog->publicList(),
            'weekly' => $clock->snapshot('weekly')]);
    }

    public function games(RankedGameCatalog $catalog, CompetitionClock $clock): JsonResponse
    {
        return response()->json(['games' => $catalog->publicList(),
            'weekly' => $clock->snapshot('weekly'), 'refresh_seconds' => 60]);
    }

    public function register(Request $request): JsonResponse
    {
        $name = $this->name($request); $token = Str::random(64);
        $expires = now()->addDays((int) config('demian-arcade.player_session_days'));
        $player = ArcadePlayer::query()->create(['display_name' => $name,
            'token_hash' => hash('sha256', $token), 'token_expires_at' => $expires]);

        return response()->json(['player_id' => $player->id, 'display_name' => $player->display_name,
            'token' => $token, 'token_expires_at' => $expires->toIso8601String()], 201);
    }

    public function issueRecoveryLink(Request $request): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');
        // Enforce a per-account budget in addition to the IP/route throttle.
        // Reissuing revokes the prior secret rather than accumulating grants.
        $limitKey = 'arcade:recovery-issue:'.$player->id;
        abort_if(RateLimiter::tooManyAttempts($limitKey, 3), 429,
            'Recovery link issuance temporarily limited.');
        RateLimiter::hit($limitKey, 3600);
        $secret = Str::random(64);
        $expires = now()->addMinutes((int) config('demian-arcade.recovery_link_minutes'));
        $player->update(['recovery_hash' => hash('sha256', $secret), 'recovery_expires_at' => $expires]);

        // Only return the secret at issue time. Never persist or log plaintext.
        return response()->json(['recovery_code' => $secret, 'recovery_expires_at' => $expires->toIso8601String()])
            ->header('Cache-Control', 'no-store, private');
    }

    public function issueBackupCode(Request $request): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');
        $limitKey = 'arcade:backup-issue:'.$player->id;
        abort_if(RateLimiter::tooManyAttempts($limitKey, 2), 429, 'Backup code issuance temporarily limited.');
        RateLimiter::hit($limitKey, 3600);
        $secret = Str::random(64);
        $expires = now()->addDays((int) config('demian-arcade.backup_code_days'));
        // User must save this once, outside the app. Only a hash is persisted.
        $player->update(['backup_hash' => hash('sha256', $secret), 'backup_expires_at' => $expires]);

        return response()->json(['backup_code' => $secret,
            'backup_expires_at' => $expires->toIso8601String()])
            ->header('Cache-Control', 'no-store, private');
    }

    public function recover(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'recovery_code' => ['required', 'string', 'size:64', 'regex:/^[A-Za-z0-9]{64}$/'],
        ]);
        $secretHash = hash('sha256', $validated['recovery_code']);

        $session = DB::transaction(function () use ($secretHash): array {
            $player = ArcadePlayer::query()->where(function ($query) use ($secretHash): void {
                $query->where('recovery_hash', $secretHash)->orWhere('backup_hash', $secretHash);
            })->lockForUpdate()->first();
            $linkValid = $player && $player->recovery_hash === $secretHash
                && $player->recovery_expires_at?->isFuture();
            $backupValid = $player && $player->backup_hash === $secretHash
                && $player->backup_expires_at?->isFuture();
            abort_unless($linkValid || $backupValid, 422,
                'Recovery code expired or already used.');
            $token = Str::random(64);
            // Rotate the active token, consume the one-time recovery secret,
            // and leave all prior verified scores and run history untouched.
            $expires = now()->addDays((int) config('demian-arcade.player_session_days'));
            $player->update(['token_hash' => hash('sha256', $token),
                'token_expires_at' => $expires, 'recovery_hash' => null, 'recovery_expires_at' => null,
                'backup_hash' => null, 'backup_expires_at' => null]);

            return ['player_id' => $player->id, 'display_name' => $player->display_name,
                'token' => $token, 'token_expires_at' => $expires->toIso8601String()];
        }, 3);

        return response()->json($session)->header('Cache-Control', 'no-store, private');
    }

    public function rename(Request $request): JsonResponse
    {
        $name = $this->name($request); $player = $request->attributes->get('arcade_player');
        $player->update(['display_name' => $name]);

        return response()->json(['player_id' => $player->id, 'display_name' => $player->display_name]);
    }

    public function me(Request $request): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');

        return response()->json(['player_id' => $player->id, 'display_name' => $player->display_name,
            'token_expires_at' => $player->token_expires_at?->toIso8601String()]);
    }

    public function erase(Request $request): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');
        // Lock player before coupon rows (same lock order as checkout).
        // Revoke unspent bearer capabilities before cascade/null-on-delete.
        DB::transaction(function () use ($player): void {
            $locked = ArcadePlayer::query()->whereKey($player->id)->lockForUpdate()->firstOrFail();
            app(\App\Services\Arcade\CouponLifecycleService::class)->revokeForErasure($locked->id);
            $locked->delete();
        }, 3);

        return response()->json(['status' => 'deleted']);
    }

    public function personalBest(Request $request, CompetitionClock $clock): JsonResponse
    {
        $values = $request->validate(['period' => ['sometimes', Rule::in(['all', 'daily', 'weekly'])]]);
        $window = $clock->snapshot($values['period'] ?? 'weekly');
        $player = $request->attributes->get('arcade_player');
        $rules = app(RunnerReplayVerifier::class)->rules();
        $scope = fn () => DB::table('arcade_leaderboard_entries')
            ->where('game_id', 'dino-run')
            ->where('rules_version', $rules['version'])
            ->where('period_key', $window['period_key']);
        $entry = $scope()->where('player_id', $player->id)->first(['id', 'score', 'achieved_at']);
        $participants = $scope()->count();
        $rank = null;
        if ($entry) {
            // Match public leaderboard ordering: score DESC, achieved_at ASC, id ASC.
            // Count ahead on the server so players beyond the public top 20 have an exact rank.
            $ahead = $scope()->where(function ($query) use ($entry): void {
                $query->where('score', '>', $entry->score)
                    ->orWhere(function ($tie) use ($entry): void {
                        $tie->where('score', $entry->score)
                            ->where(function ($earlier) use ($entry): void {
                                $earlier->where('achieved_at', '<', $entry->achieved_at)
                                    ->orWhere(function ($sameTime) use ($entry): void {
                                        $sameTime->where('achieved_at', $entry->achieved_at)
                                            ->where('id', '<', $entry->id);
                                    });
                            });
                    });
            })->count();
            $rank = $ahead + 1;
        }

        return response()->json(['game_id' => 'dino-run', ...$window,
            'my_rank' => $rank, 'participants' => $participants,
            'best' => $entry ? ['score' => (int) $entry->score, 'achieved_at' => $entry->achieved_at] : null]);
    }

    public function start(StartArcadeRunRequest $request, ArcadeRunService $service): JsonResponse
    {
        $run = $service->start($request->attributes->get('arcade_player'), $request->validated());

        return response()->json(['run_id' => $run->id, 'seed' => $run->seed, 'track_width' => $run->track_width,
            'rules_version' => $run->rules_version, 'expires_at' => $run->expires_at->toIso8601String()], 201);
    }

    public function complete(CompleteArcadeRunRequest $request, ArcadeRun $run, ArcadeRunService $service): JsonResponse
    {
        return response()->json($service->complete($request->attributes->get('arcade_player'), $run, $request->validated()));
    }

    public function leaderboard(Request $request, LeaderboardService $service): JsonResponse
    {
        $data = $request->validate(['period' => ['sometimes', Rule::in(['all', 'daily', 'weekly'])],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50']]);

        return response()->json($service->read($data['period'] ?? 'weekly', (int) ($data['limit'] ?? 20)));
    }
}
