<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Arcade\CouponDeliverySupportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CouponDeliveryController extends Controller
{
    public function acknowledge(Request $request, int $couponId,
        CouponDeliverySupportService $service): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');
        return response()->json([
            'data' => $service->acknowledge($player->id, $couponId),
        ])->header('Cache-Control', 'private, no-store');
    }

    public function openCase(Request $request, int $couponId,
        CouponDeliverySupportService $service): JsonResponse
    {
        $data = $request->validate([
            'request_key' => ['required', 'uuid'],
            'category' => ['required', 'in:not_received,invalid_code,redemption,terms,other'],
            'description' => ['nullable', 'string', 'max:300'],
        ]);
        $player = $request->attributes->get('arcade_player');
        $result = $service->submit($player->id, $couponId, $data);

        return response()->json(['data' => $result],
            $result['idempotent_replay'] ? 200 : 201)
            ->header('Cache-Control', 'private, no-store');
    }
}
