<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Arcade\ReferralService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ReferralController extends Controller
{
    public function show(Request $request, ReferralService $service): JsonResponse
    {
        return response()->json($service->profile($request->attributes->get('arcade_player')->id))
            ->header('Cache-Control','no-store, private');
    }

    public function code(Request $request, ReferralService $service): JsonResponse
    {
        $service->code($request->attributes->get('arcade_player')->id);
        return $this->show($request,$service);
    }
}
