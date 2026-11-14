<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

final class ArcadeHealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $releaseFile = base_path('.mobile11-release');
        $release = is_file($releaseFile) ? trim((string) file_get_contents($releaseFile)) : 'local';

        try {
            // /up only verifies Laravel bootstrap; this verifies the arcade
            // schema and cache read path without mutating player data.
            DB::table('arcade_players')->limit(1)->exists();
            DB::table('arcade_runs')->limit(1)->exists();
            DB::table('arcade_leaderboard_entries')->limit(1)->exists();
            Cache::store()->get('mobile11:readiness');
            $response = response()->json(['status' => 'ok', 'release' => $release]);
        } catch (Throwable $error) {
            report($error);
            // No DB, cache, internal host or credential details in public JSON.
            $response = response()->json(['status' => 'unavailable', 'release' => $release], 503);
        }

        return $response->header('Cache-Control', 'no-store, private')
            ->header('X-Content-Type-Options', 'nosniff');
    }
}
