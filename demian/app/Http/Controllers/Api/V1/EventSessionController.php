<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\EventSession;
use App\Services\Events\EventSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class EventSessionController extends Controller
{
    public function store(string $event, Request $request, EventSessionService $sessions): JsonResponse
    {
        $payload = $request->validate([
            'source' => ['nullable', 'string', 'max:64'],
            'client_version' => ['nullable', 'string', 'max:32'],
            'platform' => ['nullable', 'string', 'max:32'],
        ]);
        $started = $sessions->start($event, $payload);

        return response()->json([
            'data' => [
                'id' => $started['session']->id,
                'event_id' => $started['session']->event_id,
                'definition_revision' => $started['session']->definition_revision,
                'seed' => $started['session']->seed,
                'token' => $started['token'],
                'started_at' => $started['session']->started_at,
                'expires_at' => $started['session']->expires_at,
            ],
            'definition' => $started['definition'],
        ], 201);
    }

    public function complete(EventSession $eventSession, Request $request, EventSessionService $sessions): JsonResponse
    {
        $payload = $request->validate([
            'score' => ['required', 'integer', 'min:0'],
            'elapsed_ms' => ['required', 'integer', 'min:0', 'max:7200000'],
            'evidence' => ['required', 'array'],
            'evidence.collected_item_ids' => ['sometimes', 'array', 'max:500'],
            'evidence.collected_item_ids.*' => ['string', 'max:64'],
            'evidence.reached_zone_ids' => ['sometimes', 'array', 'max:100'],
            'evidence.reached_zone_ids.*' => ['string', 'max:64'],
            'evidence.defeated_enemy_ids' => ['sometimes', 'array', 'max:500'],
            'evidence.defeated_enemy_ids.*' => ['string', 'max:64'],
        ]);
        $token = (string) $request->header('X-Event-Token');
        $claim = $sessions->complete($eventSession, $token, $payload);

        return response()->json(['data' => $claim->fresh()]);
    }
}
