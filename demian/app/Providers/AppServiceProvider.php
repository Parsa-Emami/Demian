<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // A destructive operation must have its own rate-limit bucket.
        // Numeric throttle:2,1 could share a guest/IP bucket with unrelated
        // arcade routes, causing a valid account deletion to be rate-limited.
        RateLimiter::for('arcade-profile-delete', static function (Request $request): Limit {
            $playerId = $request->attributes->get('arcade_player')?->id;
            $subject = $playerId ?: 'guest:'.$request->ip();

            return Limit::perMinute(2)->by('arcade-profile-delete:'.$subject);
        });
    }
}
