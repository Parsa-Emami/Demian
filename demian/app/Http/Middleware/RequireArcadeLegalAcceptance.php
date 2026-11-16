<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Reject only new server-ranked runs until the player has acknowledged the
 * current, operator-reviewed policy. Completed proofs and data rights must
 * remain available while a policy is being updated.
 */
final class RequireArcadeLegalAcceptance
{
    public function handle(Request $request, Closure $next): Response
    {
        if (config('demian-legal.require_acceptance') === true) {
            $player = $request->attributes->get('arcade_player');
            abort_unless($player
                && $player->legal_policy_version === config('demian-legal.version')
                && $player->legal_accepted_at !== null, 428,
                'Current terms and privacy notice acknowledgement required.');
        }

        return $next($request);
    }
}
