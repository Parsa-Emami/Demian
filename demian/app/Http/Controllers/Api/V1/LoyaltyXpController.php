<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Arcade\LoyaltyXpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class LoyaltyXpController extends Controller
{
    public function show(Request $request, LoyaltyXpService $service): JsonResponse
    {
        return response()->json($service->profile($request->attributes->get('arcade_player')->id))
            ->header('Cache-Control', 'no-store, private')->header('Pragma', 'no-cache');
    }
}
