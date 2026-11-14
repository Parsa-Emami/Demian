<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Arcade\CouponIssuanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Player-facing read-only wallet. There are intentionally no customer, store
 * or payment endpoints that can consume a coupon over the arcade API.
 */
final class CouponController extends Controller
{
    public function wallet(Request $request, CouponIssuanceService $service): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');

        return response()->json(['data' => $service->listForPlayer($player->id)])
            ->header('Cache-Control', 'private, no-store');
    }
}
