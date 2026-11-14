<?php

namespace App\Http\Middleware;

use App\Models\ArcadePlayer;
use App\Models\ArcadeRun;
use App\Services\Arcade\ArcadeAntiCheat;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * Capture *outcomes* of authenticated, failed replay submissions only.
 * Never log raw IP, authorization headers, replay payload or error messages.
 * A normal client 409/422 doesn't by itself restrict a player.
 */
final class ObserveArcadeReplayFailures
{
    public function __construct(private readonly ArcadeAntiCheat $antiCheat) {}

    public function handle(Request $request, Closure $next): Response
    {
        try {
            $response = $next($request);
        } catch (\Throwable $error) {
            $code = $error instanceof ValidationException ? 422
                : ($error instanceof HttpExceptionInterface ? $error->getStatusCode() : 0);
            $this->record($this->antiCheat, $request, $code);
            throw $error;
        }
        $this->record($this->antiCheat, $request, $response->getStatusCode());
        return $response;
    }

    private function record(ArcadeAntiCheat $antiCheat, Request $request,
        int $code): void
    {
        if (! $antiCheat->enabled() || ! in_array($code, [409, 410, 422], true)) return;
        $player = $request->attributes->get('arcade_player');
        if (! $player instanceof ArcadePlayer) return;
        $run = $request->route('run');
        $antiCheat->rejected($player, $run instanceof ArcadeRun ? $run : null,
            $code, $request->ip());
    }
}
