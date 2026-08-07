<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Events\EventSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EventSessionController extends Controller
{
    protected EventSessionService $sessionService;

    public function __construct(EventSessionService $sessionService)
    {
        $this->sessionService = $sessionService;
    }

    /**
     * ورود به محیط جهان باز
     */
    public function enterOpenWorld(Request $request): JsonResponse
    {
        $user = $request->user();
        
        // 1. بررسی سریع سشن بدون درگیر کردن جداول پاداش
        $activeSession = $this->sessionService->getOrCreateActiveSession($user->id);

        if (!$activeSession) {
            return response()->json(['error' => 'Session creation failed'], 500);
        }

        // 2. ارسال پاسخ سریع به بازی برای عبور از صفحه لودینگ
        return response()->json([
            'status' => 'success',
            'session_id' => $activeSession->id,
            'world_state' => Cache::get('current_world_state', 'default'),
        ]);
    }
}