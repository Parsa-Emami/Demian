<?php

namespace App\Http\Middleware;

use App\Models\ArcadePlayer;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class AuthenticateArcadePlayer
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        abort_unless(is_string($token) && strlen($token) === 64, 401, 'Invalid player token.');
        $player = ArcadePlayer::query()->where('token_hash', hash('sha256', $token))
            ->where('token_expires_at', '>', now())->first();
        abort_unless($player, 401, 'Invalid player token.');
        $request->attributes->set('arcade_player', $player);

        return $next($request);
    }
}
