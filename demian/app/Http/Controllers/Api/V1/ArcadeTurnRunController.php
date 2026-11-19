<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StartTurnRunRequest;
use App\Http\Requests\CompleteTurnRunRequest;
use App\Models\ArcadeRun;
use App\Services\Arcade\ArcadeTurnRunService;
use App\Services\Arcade\CafeCrittersReplayVerifier;
use App\Services\Arcade\CafeDriftReplayVerifier;
use App\Services\Arcade\CoffeeCrashReplayVerifier;
use App\Services\Arcade\LeaderboardService;
use Illuminate\Validation\Rule;
use Domain\Arcade\WeeklyContent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ArcadeTurnRunController extends Controller
{
    public function leaderboard(Request $request, LeaderboardService $service): JsonResponse
    {
        $data = $request->validate([
            'period' => ['sometimes', Rule::in(['all', 'daily', 'weekly'])],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);
        return response()->json($service->readForGame(
            CafeCrittersReplayVerifier::GAME_ID, $data['period'] ?? 'weekly',
            (int) ($data['limit'] ?? 20)
        ));
    }

    public function coffeeLeaderboard(Request $request, LeaderboardService $service): JsonResponse
    {
        $data = $request->validate([
            'period' => ['sometimes', Rule::in(['all', 'daily', 'weekly'])],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);
        return response()->json($service->readForGame(
            CoffeeCrashReplayVerifier::GAME_ID, $data['period'] ?? 'weekly',
            (int) ($data['limit'] ?? 20)
        ));
    }

    public function gameLeaderboard(Request $request, string $gameId,
        LeaderboardService $service): JsonResponse
    {
        abort_unless($gameId === CafeDriftReplayVerifier::GAME_ID
            || isset(\App\Services\Arcade\CafeRouteReplayVerifier::VERSIONS[$gameId]),
            404);
        $data = $request->validate([
            'period' => ['sometimes', Rule::in(['all', 'daily', 'weekly'])],
            'week' => ['sometimes', 'string', 'size:10', 'date_format:Y-m-d'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);
        if (isset($data['week'])) {
            abort_unless($gameId === CafeDriftReplayVerifier::GAME_ID && ($data['period'] ?? 'weekly') === 'weekly', 422);
            return response()->json($service->driftArchive($data['week'], (int) ($data['limit'] ?? 20)));
        }
        return response()->json($service->readForGame(
            $gameId, $data['period'] ?? 'weekly', (int) ($data['limit'] ?? 20)
        ));
    }

    public function start(StartTurnRunRequest $request, ArcadeTurnRunService $service): JsonResponse
    {
        $run = $service->start($request->attributes->get('arcade_player'),
            $request->validated());
        $isWeeklyWorld = $run->rules_version === WeeklyContent::version('open-world');
        $contentWeek = WeeklyContent::index($run->started_at);
        $legacyRoute = (\App\Services\Arcade\CafeRouteReplayVerifier::VERSIONS[$run->game_id] ?? null) === $run->rules_version;
        $challenge = $isWeeklyWorld || $legacyRoute
            ? app(\App\Services\Arcade\CafeRouteReplayVerifier::class)
                ->goals($run->game_id, (int) $run->seed, $isWeeklyWorld ? $contentWeek : null) : null;
        return response()->json([
            'run_id' => $run->id, 'game_id' => $run->game_id,
            'rules_version' => $run->rules_version,
            'seed' => $run->seed, 'content_week' => $contentWeek,
            'goals' => $challenge,
            'expires_at' => $run->expires_at->toIso8601String(),
        ], 201)->header('Cache-Control', 'no-store');
    }

    public function complete(CompleteTurnRunRequest $request, ArcadeRun $run,
        ArcadeTurnRunService $service): JsonResponse
    {
        return response()->json($service->complete(
            $request->attributes->get('arcade_player'), $run, $request->validated()
        ))->header('Cache-Control', 'no-store');
    }
}
