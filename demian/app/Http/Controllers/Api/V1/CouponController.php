<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Arcade\CouponIssuanceService;
use App\Services\Arcade\CouponShopService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CouponController extends Controller
{
    /** Authenticated player wallet; never public or cacheable. */
    public function wallet(Request $request, CouponIssuanceService $service): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');
        return response()->json(['data' => $service->listForPlayer($player->id)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function quote(Request $request, CouponShopService $service): JsonResponse
    {
        return $this->execute('quote', $request, $service);
    }

    public function reserve(Request $request, CouponShopService $service): JsonResponse
    {
        return $this->execute('reserve', $request, $service);
    }

    public function commit(Request $request, CouponShopService $service): JsonResponse
    {
        return $this->execute('commit', $request, $service);
    }

    public function cancel(Request $request, CouponShopService $service): JsonResponse
    {
        return $this->execute('cancel', $request, $service);
    }

    private function execute(string $action, Request $request, CouponShopService $service): JsonResponse
    {
        // Authenticate the exact signed bytes and request path before parsing.
        $event = $service->authenticate($request);
        $rules = [
            'code' => ['required', 'string', 'regex:/^DMC-[A-F0-9]{32}$/D'],
        ];
        if (in_array($action, ['reserve', 'quote'], true)) {
            $rules['subtotal_minor'] = ['required', 'integer', 'min:1', 'max:1000000000000'];
            $rules['currency'] = ['required', 'string', 'size:3', 'regex:/^[A-Z]{3}$/D'];
        }
        if (in_array($action, ['reserve', 'commit', 'cancel'], true)) {
            $rules['order_ref'] = ['required', 'string', 'min:8', 'max:128',
                'regex:/^[A-Za-z0-9_.:-]{8,128}$/D'];
        }
        $data = $request->validate($rules);
        $result = $service->handle($action, $event, $request, $data);

        return response()->json($result['body'], $result['status'])
            ->header('Cache-Control', 'private, no-store');
    }
}
