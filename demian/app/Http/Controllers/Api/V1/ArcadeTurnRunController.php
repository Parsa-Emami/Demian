<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StartTurnRunRequest;
use App\Http\Requests\CompleteTurnRunRequest;
use App\Models\ArcadeRun;
use App\Services\Arcade\ArcadeTurnRunService;
use App\Services\Arcade\CafeCrittersReplayVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ArcadeTurnRunController extends Controller
{
    public function start(StartTurnRunRequest $request, ArcadeTurnRunService $service): JsonResponse
    {
        $run = $service->start($request->attributes->get('arcade_player'),
            $request->validated());
        return response()->json([
            'run_id' => $run->id, 'game_id' => $run->game_id,
            'rules_version' => $run->rules_version,
            'seed' => $run->seed,
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
