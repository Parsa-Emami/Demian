<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Arcade\CouponLifecycleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ArcadeCouponController extends Controller
{
    public function mine(Request $request, CouponLifecycleService $service): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');

        return response()->json(['coupons' => $service->myCoupons($player->id)])
            ->header('Cache-Control', 'no-store, private');
    }

    private function checkout(Request $request, bool $withOrder): array
    {
        return $request->validate([
            'code' => ['required', 'string', 'regex:/^DMN-[A-F0-9]{32}$/D'],
            'player_id' => ['required', 'uuid'],
            'order_id' => [$withOrder ? 'required' : 'sometimes', 'string', 'max:80',
                'regex:/^[A-Za-z0-9._:-]{1,80}$/D'],
            'order_total_minor' => ['required', 'integer', 'min:1', 'max:1000000000'],
            'currency' => ['required', 'string', 'regex:/^[A-Z]{3}$/D'],
        ]);
    }

    private function cancellation(Request $request): array
    {
        return $request->validate([
            'code' => ['required', 'string', 'regex:/^DMN-[A-F0-9]{32}$/D'],
            'player_id' => ['required', 'uuid'],
            'order_id' => ['required', 'string', 'max:80',
                'regex:/^[A-Za-z0-9._:-]{1,80}$/D'],
        ]);
    }

    public function quote(Request $request, CouponLifecycleService $service): JsonResponse
    {
        $data = $this->checkout($request, false);

        return response()->json($service->quote($data['code'], $data['player_id'],
            (int) $data['order_total_minor'], $data['currency']));
    }

    public function reserve(Request $request, CouponLifecycleService $service): JsonResponse
    {
        $data = $this->checkout($request, true);

        return response()->json($service->reserve($data['code'], $data['player_id'],
            $data['order_id'], (int) $data['order_total_minor'], $data['currency']));
    }

    public function capture(Request $request, CouponLifecycleService $service): JsonResponse
    {
        $data = $this->checkout($request, true);

        return response()->json($service->capture($data['code'], $data['player_id'],
            $data['order_id'], (int) $data['order_total_minor'], $data['currency']));
    }

    public function release(Request $request, CouponLifecycleService $service): JsonResponse
    {
        $data = $this->cancellation($request);

        return response()->json($service->release($data['code'], $data['player_id'], $data['order_id']));
    }
}
