<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StartTurnRunRequest;
use App\Http\Requests\CompleteTurnRunRequest;
use App\Models\ArcadeRun;
use App\Services\Arcade\ArcadeTurnRunService;
use App\Services\Arcade\CafeCrittersReplayVerifier;
use App\Services\Arcade\CoffeeCrashReplayVerifier;
use App\Services\Arcade\LeaderboardService;
use Illuminate\Validation\Rule;
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

    /** Read-only verified route-trial ranking; hidden when rollout flag is OFF. */
    public function routeLeaderboard(Request $request, string $gameId,
        LeaderboardService $service): JsonResponse
    {
        abort_unless(isset(\App\Services\Arcade\CafeRouteReplayVerifier::VERSIONS[$gameId]),
            404);
        $data = $request->validate([
            'period' => ['sometimes', Rule::in(['all', 'daily', 'weekly'])],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);
        return response()->json($service->readForGame(
            $gameId, $data['period'] ?? 'weekly', (int) ($data['limit'] ?? 20)
        ));
    }

    public function start(StartTurnRunRequest $request, ArcadeTurnRunService $service): JsonResponse
    {
        $run = $service->start($request->attributes->get('arcade_player'),
            $request->validated());
        $challenge = isset(\App\Services\Arcade\CafeRouteReplayVerifier::VERSIONS[$run->game_id])
            && $run->rules_version === \App\Services\Arcade\CafeRouteReplayVerifier::VERSIONS[$run->game_id]
            ? app(\App\Services\Arcade\CafeRouteReplayVerifier::class)
                ->goals($run->game_id, (int) $run->seed) : null;
        return response()->json([
            'run_id' => $run->id, 'game_id' => $run->game_id,
            'rules_version' => $run->rules_version,
            'seed' => $run->seed,
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
