<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Arcade\QuietHoursService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class QuietHoursController extends Controller
{
    public function index(Request $request, QuietHoursService $service): JsonResponse
    {
        return response()->json($service->offers($request->attributes->get('arcade_player')))
            ->header('Cache-Control', 'private, no-store');
    }

    public function claim(Request $request, int $offerId, QuietHoursService $service): JsonResponse
    {
        return response()->json($service->claim($request->attributes->get('arcade_player'), $offerId))
            ->header('Cache-Control', 'private, no-store');
    }
}
