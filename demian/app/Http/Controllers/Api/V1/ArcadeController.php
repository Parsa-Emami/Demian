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
use App\Services\Arcade\PlayerContact;
use App\Services\Arcade\PhoneIdentityService;
use Illuminate\Database\UniqueConstraintViolationException;
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
        return response()->json(['game_id' => 'dino-run', 'rules' => [...$verifier->rules(), 'version' => $verifier->versionAt(now())],
            'characters' => config('demian-arcade.characters'),
            'games' => $catalog->publicList(),
            'weekly' => $clock->snapshot('weekly')]);
    }

    public function games(RankedGameCatalog $catalog, CompetitionClock $clock): JsonResponse
    {
        return response()->json(['games' => $catalog->publicList(),
            'weekly' => $clock->snapshot('weekly'), 'refresh_seconds' => 60]);
    }

    /**
     * Public, read-only weekly schedule. No account details, private risk
     * signals, prizes or mutable ledger state are returned.
     */
    public function weeklyCompetition(\App\Services\Arcade\WeeklyCompetitionService $service,
        \App\Services\Arcade\WeeklyFairScoringService $fair): JsonResponse
    {
        return response()->json([
            ...$service->publicSchedule(),
            'fair_scoring' => $fair->rules(),
        ])->header('Cache-Control', 'public, max-age=15');
    }

    public function fairRules(\App\Services\Arcade\WeeklyFairScoringService $fair): JsonResponse
    {
        return response()->json($fair->rules())
            ->header('Cache-Control', 'public, max-age=300');
    }

    /**
     * Public sealed-season comparative scores; no request-supplied scores,
     * financial eligibility decisions, replay proofs or moderation signals.
     */
    public function fairLeaderboard(Request $request,
        \App\Services\Arcade\WeeklyFairScoringService $fair): JsonResponse
    {
        $data = $request->validate([
            'week' => ['sometimes', 'date_format:Y-m-d'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);
        $key = isset($data['week']) ? 'weekly:tehran:'.$data['week']
            : CompetitionClock::periodKeys(now())[2];
        try {
            return response()->json($fair->publicRead($key, (int) ($data['limit'] ?? 20)))
                ->header('Cache-Control', 'public, max-age=15');
        } catch (\InvalidArgumentException $e) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'week' => 'Week must be a valid Saturday in Asia/Tehran.',
            ]);
        }
    }

    /**
     * Server-sourced weekly comparison. Current week is explicitly a live,
     * non-financial preview; archived weeks are immutable sealed snapshots.
     */
    public function weeklyRankings(Request $request,
        \App\Services\Arcade\WeeklyLeaderboardReadService $service): JsonResponse
    {
        $args = $request->validate([
            'week' => ['sometimes', 'date_format:Y-m-d'],
            'limit' => ['sometimes', 'integer', 'between:1,50'],
        ]);
        try {
            return response()->json($service->read($args['week'] ?? null,
                (int) ($args['limit'] ?? 20)))
                ->header('Cache-Control', 'public, max-age=15');
        } catch (\InvalidArgumentException $e) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'week' => 'Week must be a recent Saturday in Asia/Tehran.',
            ]);
        }
    }

    public function weeklyRankingWeeks(
        \App\Services\Arcade\WeeklyLeaderboardReadService $service): JsonResponse
    {
        return response()->json(['weeks' => $service->weeks()])
            ->header('Cache-Control', 'public, max-age=60');
    }

    /**
     * No client-supplied player ID. Always take identity from verified bearer
     * middleware; this exposes an exact rank even outside the public top 20.
     */
    public function myWeeklyRanking(Request $request,
        \App\Services\Arcade\WeeklyLeaderboardReadService $service): JsonResponse
    {
        $args = $request->validate([
            'week' => ['sometimes', 'date_format:Y-m-d'],
        ]);
        try {
            return response()->json($service->read($args['week'] ?? null, 20,
                $request->attributes->get('arcade_player')->id))
                ->header('Cache-Control', 'private, no-store')
                ->header('Pragma', 'no-cache');
        } catch (\InvalidArgumentException $e) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'week' => 'Week must be a recent Saturday in Asia/Tehran.',
            ]);
        }
    }

    public function register(Request $request, PlayerContact $contacts): JsonResponse
    {
        $name = $this->name($request);
        // Require both explicit terms acceptance and a privacy acknowledgement
        // in reviewed production. Legacy players do not receive fake consent.
        $required = config('demian-legal.require_acceptance') ? 'required' : 'sometimes';
        $legal = $request->validate([
            'policy_version' => [$required, 'string', Rule::in([config('demian-legal.version')])],
            'accept_terms' => [$required, 'accepted'],
            'privacy_acknowledged' => [$required, 'accepted'],
        ]);
        $accepted = ($legal['policy_version'] ?? null) === config('demian-legal.version')
            && $request->boolean('accept_terms') && $request->boolean('privacy_acknowledged');
        $contact = $contacts->fields($request, config('demian-arcade.require_contact'), true);
        $token = Str::random(64);
        $expires = now()->addDays((int) config('demian-arcade.player_session_days'));
        try {
            $player = ArcadePlayer::query()->create(['display_name' => $name,
                'token_hash' => hash('sha256', $token), 'token_expires_at' => $expires,
                'legal_policy_version' => $accepted ? config('demian-legal.version') : null,
                'legal_accepted_at' => $accepted ? now() : null, ...$contact]);
        } catch (UniqueConstraintViolationException) {
            abort(409, 'برای این مشخصات حسابی وجود دارد. حساب قبلی را بازیابی کنید.');
        }

        return response()->json(['player_id' => $player->id, 'display_name' => $player->display_name,
            'token' => $token, 'token_expires_at' => $expires->toIso8601String(),
            'has_contact' => $player->contact_hash !== null], 201);
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
            'challenge_id' => ['nullable', 'uuid'],
            'otp' => ['nullable', 'string', 'regex:/^[0-9]{6}$/D'],
            'device_id' => ['nullable', 'uuid'],
        ]);
        $secretHash = hash('sha256', $validated['recovery_code']);

        $session = DB::transaction(function () use ($secretHash, $validated): array {
            $player = ArcadePlayer::query()->where(function ($query) use ($secretHash): void {
                $query->where('recovery_hash', $secretHash)->orWhere('backup_hash', $secretHash);
            })->lockForUpdate()->first();
            $linkValid = $player && $player->recovery_hash === $secretHash
                && $player->recovery_expires_at?->isFuture();
            $backupValid = $player && $player->backup_hash === $secretHash
                && $player->backup_expires_at?->isFuture();
            abort_unless($linkValid || $backupValid, 422,
                'Recovery code expired or already used.');
            $identity = app(PhoneIdentityService::class);
            if (! $identity->recoverProof($player, $secretHash, $validated['challenge_id'] ?? null, $validated['otp'] ?? null)) {
                return ['phone_challenge_required' => true];
            }
            $token = Str::random(64);
            // Rotate the active token, consume the one-time recovery secret,
            // and leave all prior verified scores and run history untouched.
            $expires = now()->addDays((int) config('demian-arcade.player_session_days'));
            $player->update(['token_hash' => hash('sha256', $token),
                'token_expires_at' => $expires, 'recovery_hash' => null, 'recovery_expires_at' => null,
                'backup_hash' => null, 'backup_expires_at' => null]);
            DB::table('arcade_phone_challenges')->where('player_id', $player->id)->whereNull('consumed_at')->update(['consumed_at' => now()]);
            $identity->observeDevice($player->id, $validated['device_id'] ?? null);

            return ['player_id' => $player->id, 'display_name' => $player->display_name,
                'token' => $token, 'token_expires_at' => $expires->toIso8601String()];
        }, 3);

        return response()->json($session, isset($session['phone_challenge_required']) ? 428 : 200)->header('Cache-Control', 'no-store, private');
    }

    public function acknowledgeLegal(Request $request): JsonResponse
    {
        $request->validate([
            'policy_version' => ['required', 'string', Rule::in([config('demian-legal.version')])],
            'accept_terms' => ['required', 'accepted'],
            'privacy_acknowledged' => ['required', 'accepted'],
        ]);
        $player = $request->attributes->get('arcade_player');
        $player->update([
            'legal_policy_version' => config('demian-legal.version'),
            'legal_accepted_at' => now(),
        ]);

        return response()->json([
            'legal_policy_version' => $player->legal_policy_version,
            'legal_accepted_at' => $player->legal_accepted_at?->toIso8601String(),
        ])->header('Cache-Control', 'no-store, private');
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
            'token_expires_at' => $player->token_expires_at?->toIso8601String(),
            'legal_policy_version' => $player->legal_policy_version, 'has_contact' => $player->contact_hash !== null,
            'phone_verified' => app(PhoneIdentityService::class)->identity($player->id) !== null])->header('Cache-Control', 'private, no-store');
    }

    public function updateContact(Request $request, PlayerContact $contacts): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');
        $fields = $contacts->fields($request, true);
        try {
            if (ArcadePlayer::query()->whereKey($player->id)->whereNull('contact_hash')->update([
                ...$fields, 'contact_value' => \Illuminate\Support\Facades\Crypt::encryptString($fields['contact_value']),
            ]) === 0) {
                abort(409, 'راه ارتباطی قبلاً ثبت شده است.');
            }
        } catch (UniqueConstraintViolationException) {
            abort(409, 'این راه ارتباطی به حساب دیگری تعلق دارد.');
        }

        return response()->json(['has_contact' => true]);
    }

    public function erase(Request $request): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');
        // Revoke unconsumed vouchers before erasing a player. Settled history
        // remains anonymous, but an erased account must not retain live codes.
        DB::transaction(function () use ($player): void {
            ArcadePlayer::query()->whereKey($player->id)->lockForUpdate()->firstOrFail();
            app(\App\Services\Arcade\CouponIssuanceService::class)
                ->revokeForDeletedPlayer($player->id);
            $player->delete();
        }, 3);

        return response()->json(['status' => 'deleted']);
    }

    public function personalBest(Request $request, LeaderboardService $leaderboards): JsonResponse
    {
        $values = $request->validate([
            'period' => ['sometimes', Rule::in(['all', 'daily', 'weekly'])],
            'week' => ['sometimes', 'string', 'size:10', 'date_format:Y-m-d'],
            'game_id' => ['sometimes', Rule::in(['dino-run', 'cafe-drift'])],
        ]);
        $player = $request->attributes->get('arcade_player');

        if (isset($values['week'])) {
            abort_unless(($values['game_id'] ?? null) === 'cafe-drift' && ($values['period'] ?? 'weekly') === 'weekly', 422);
            return response()->json($leaderboards->driftArchive($values['week'], 0, $player->id))
                ->header('Cache-Control', 'private, no-store');
        }
        return response()->json($leaderboards->personal(
            $values['game_id'] ?? 'dino-run', $values['period'] ?? 'weekly', $player->id,
        ))->header('Cache-Control', 'private, no-store');
    }

    public function start(StartArcadeRunRequest $request, ArcadeRunService $service): JsonResponse
    {
        $run = $service->start($request->attributes->get('arcade_player'), $request->validated());

        return response()->json(['run_id' => $run->id, 'seed' => $run->seed, 'track_width' => $run->track_width,
            'rules_version' => $run->rules_version, 'content_week' => \Domain\Arcade\WeeklyContent::index($run->started_at), 'expires_at' => $run->expires_at->toIso8601String()], 201);
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
