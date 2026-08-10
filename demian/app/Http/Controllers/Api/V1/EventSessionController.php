<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\EventSession;
use App\Services\Events\EventSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class EventSessionController extends Controller
{
    public function __construct(private readonly EventSessionService $sessionService) {}

    /**
     * Start an authoritative event session and return the one-time raw token.
     */
    public function store(Request $request, string $event): JsonResponse
    {
        $metadata = $request->validate([
            'source' => ['sometimes', 'string', 'max:64'],
            'client_version' => ['sometimes', 'string', 'max:64'],
            'platform' => ['sometimes', 'string', 'max:64'],
        ]);

        $started = $this->sessionService->start($event, $metadata);
        /** @var EventSession $session */
        $session = $started['session'];

        return response()->json([
            'data' => [
                'id' => $session->id,
                'event_id' => $session->event_id,
                'definition_revision' => $session->definition_revision,
                'seed' => $session->seed,
                'token' => $started['token'],
                'status' => $session->status,
                'started_at' => $session->started_at?->toISOString(),
                'expires_at' => $session->expires_at?->toISOString(),
            ],
            'definition' => $started['definition'],
        ], 201);
    }

    /**
     * Validate the submitted client evidence and claim the event reward once.
     */
    public function complete(Request $request, EventSession $eventSession): JsonResponse
    {
        $token = trim((string) $request->header('X-Event-Token', ''));
        if ($token === '') {
            throw ValidationException::withMessages([
                'token' => 'The X-Event-Token header is required.',
            ]);
        }

        $payload = $request->validate([
            'score' => ['required', 'integer', 'min:0'],
            'elapsed_ms' => ['required', 'integer', 'min:0'],
            'evidence' => ['present', 'array'],
            'evidence.collected_item_ids' => ['sometimes', 'array'],
            'evidence.collected_item_ids.*' => ['string', 'max:128', 'distinct'],
            'evidence.reached_zone_ids' => ['sometimes', 'array'],
            'evidence.reached_zone_ids.*' => ['string', 'max:128', 'distinct'],
            'evidence.defeated_enemy_ids' => ['sometimes', 'array'],
            'evidence.defeated_enemy_ids.*' => ['string', 'max:128', 'distinct'],
        ]);

        $claim = $this->sessionService->complete($eventSession, $token, $payload);

        return response()->json(['data' => $claim]);
    }
}
