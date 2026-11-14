<?php

namespace App\Http\Middleware;

use App\Services\Arcade\CafeAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class RequireCafePermission
{
    public function handle(Request $request, Closure $next, string $ability): Response
    {
        CafeAccess::authorize($request->attributes->get('cafe_staff'), $ability);

        return $next($request);
    }
}
