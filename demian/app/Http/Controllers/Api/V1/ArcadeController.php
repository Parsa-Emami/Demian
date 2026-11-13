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
        $player = ArcadePlayer::query()->create(['display_name' => $name, 'token_hash' => hash('sha256', $token)]);

        return response()->json(['player_id' => $player->id, 'display_name' => $player->display_name, 'token' => $token], 201);
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

        return response()->json(['player_id' => $player->id, 'display_name' => $player->display_name]);
    }

    public function erase(Request $request): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');
        // FK cascade removes runs, replay inputs and all leaderboard entries.
        $player->delete();

        return response()->json(['status' => 'deleted']);
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

        return response()->json($service->read($data['period'] ?? 'all', (int) ($data['limit'] ?? 20)));
    }
}
