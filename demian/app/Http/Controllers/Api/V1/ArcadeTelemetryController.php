<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

final class ArcadeTelemetryController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        abort_unless(config('demian-ops.enabled') === true
            && config('demian-ops.client_telemetry_enabled') === true, 404);

        // Explicit allowlist prevents raw JS exception messages, user IDs,
        // IPs, browser fingerprints, recovery codes or arbitrary labels.
        $data = $request->validate([
            'kind' => ['required', Rule::in(['menu_ready', 'game_load', 'game_error', 'fps'])],
            'game' => ['nullable', Rule::in(['open-world', 'dino-run', 'after-hours',
                'cafe-rush', 'cafe-critters', 'coffee-crash', 'cafe-drift'])],
            'duration_ms' => ['nullable', 'integer', 'between:0,60000'],
            'fps' => ['nullable', 'integer', 'between:0,120'],
        ]);
        if ($data['kind'] === 'game_load' || $data['kind'] === 'game_error') {
            abort_unless(isset($data['game']), 422);
        }
        // Only an approved small number of dimensions reaches the log.
        try {
            Log::channel('demian_ops')->info('client_metric', [
                'event' => 'client', 'kind' => $data['kind'],
                'game' => $data['game'] ?? null, 'duration_ms' => $data['duration_ms'] ?? null,
                'fps' => $data['fps'] ?? null,
            ]);
        } catch (\Throwable) { /* Observability is never part of gameplay correctness. */ }

        return response()->json(['status' => 'accepted'], 202)->header('Cache-Control', 'no-store');
    }
}
