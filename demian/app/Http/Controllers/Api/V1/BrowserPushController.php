<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Arcade\BrowserPushService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class BrowserPushController extends Controller
{
    public function config(Request $request, BrowserPushService $push): JsonResponse
    {
        $preferences = ! app()->environment('production') || $request->isSecure()
            ? $push->preferences() : ['enabled' => false, 'public_key' => null];

        return response()->json($preferences)->header('Cache-Control', 'no-store');
    }

    public function subscribe(Request $request, BrowserPushService $push): Response
    {
        abort_unless(! app()->environment('production') || $request->isSecure(), 403);
        $subscription = $request->validate([
            'endpoint' => ['required', 'string', 'max:2048'],
            'keys' => ['required', 'array:p256dh,auth'],
            'keys.p256dh' => ['required', 'string', 'size:87'],
            'keys.auth' => ['required', 'string', 'size:22'],
        ]);
        $push->subscribe($request->attributes->get('arcade_player')->id, $subscription);

        return response()->noContent()->header('Cache-Control', 'no-store');
    }

    public function unsubscribe(Request $request, BrowserPushService $push): Response
    {
        $input = $request->validate(['endpoint' => ['required', 'string', 'max:2048']]);
        $push->unsubscribe($request->attributes->get('arcade_player')->id, $input['endpoint']);

        return response()->noContent()->header('Cache-Control', 'no-store');
    }
}
