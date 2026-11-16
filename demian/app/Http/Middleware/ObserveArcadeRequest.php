<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Illuminate\Validation\ValidationException;

/**
 * Low-overhead, PII-free structured request timing. Never read/log body,
 * bearer, IP, full URL/query, headers, exception text or player ID.
 */
final class ObserveArcadeRequest
{
    public function handle(Request $request, Closure $next): Response
    {
        if (config('demian-ops.enabled') !== true) return $next($request);

        $started = hrtime(true);
        $requestId = bin2hex(random_bytes(12)); // Server-generated, not trustable client input.
        try {
            $response = $next($request);
            $status = $response->getStatusCode();
        } catch (\Throwable $error) {
            $status = $error instanceof ValidationException ? 422
                : ($error instanceof HttpExceptionInterface ? $error->getStatusCode() : 500);
            $this->write($request, $status, $started, $requestId);
            throw $error;
        }

        $response->headers->set('X-Request-Id', $requestId);
        $this->write($request, $status, $started, $requestId);
        return $response;
    }

    private function write(Request $request, int $status, int $started, string $id): void
    {
        $duration = min(300000, max(0, (int) ((hrtime(true) - $started) / 1_000_000)));
        $slow = $duration >= (int) config('demian-ops.slow_request_ms', 1500);
        $failure = $status >= 400 || $status === 0;
        $rate = (float) config('demian-ops.sample_rate', 0.2);
        if (! $failure && ! $slow && (random_int(0, 9999) >= (int) ($rate * 10000))) return;
        try {
            $path = (string) ($request->route()?->uri() ?? '');
            // Only statically defined route templates are inspected. Dynamic
            // parameters never enter the resulting allowlisted category.
            $group = match (true) {
                str_contains($path, '/health') => 'health',
                str_contains($path, '/telemetry') => 'telemetry',
                str_contains($path, '/runs/') && str_contains($path, '/complete') => 'run_complete',
                str_contains($path, '/turn-runs/') && str_contains($path, '/complete') => 'run_complete',
                str_ends_with($path, '/runs'), str_ends_with($path, '/turn-runs') => 'run_start',
                str_contains($path, '/leaderboard'), str_contains($path, '/competition') => 'leaderboard',
                str_contains($path, '/player'), str_contains($path, '/players') => 'account',
                str_contains($path, '/coupons') => 'rewards',
                default => 'other',
            };
            Log::channel('demian_ops')->info('api_request', [
                'event' => 'http', 'request_id' => $id, 'method' => $request->method(),
                'route_group' => $group, 'status' => $status, 'duration_ms' => $duration,
                'sample_weight' => $failure || $slow ? 1 : ($rate > 0 ? round(1 / $rate, 3) : 1),
                'slow' => $slow,
            ]);
        } catch (\Throwable) {
            // Telemetry failure must never break rank submissions, privacy or auth.
        }
    }
}
