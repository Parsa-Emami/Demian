<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ArcadePlayer;
use App\Services\Arcade\ArcadePhoneVerification;
use App\Services\Arcade\ArcadePrizeIdentity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ArcadeIdentityController extends Controller
{
    public function status(Request $request, ArcadePrizeIdentity $identity): JsonResponse
    {
        return response()->json($identity->status($request->attributes->get('arcade_player')))
            ->header('Cache-Control', 'no-store, private');
    }

    public function sendOtp(Request $request, ArcadePhoneVerification $otp): JsonResponse
    {
        $request->validate([]); // Player phone is loaded from the account, never the body.
        return response()->json($otp->send($request->attributes->get('arcade_player')))
            ->header('Cache-Control', 'no-store, private');
    }

    public function verifyOtp(Request $request, ArcadePhoneVerification $otp): JsonResponse
    {
        $data = $request->validate(['code' => [
            'required', 'string', 'size:6', 'regex:/^[0-9]{6}$/D',
        ]]);
        return response()->json($otp->verify($request->attributes->get('arcade_player'), $data['code']))
            ->header('Cache-Control', 'no-store, private');
    }

    public function rotate(Request $request): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');
        $old = hash('sha256', (string) $request->bearerToken());
        $token = Str::random(64);
        $expiry = now()->addDays((int) config('demian-arcade.player_session_days'));
        DB::transaction(function () use ($player, $old, $token, $expiry): void {
            $locked = ArcadePlayer::query()->whereKey($player->id)->lockForUpdate()->firstOrFail();
            abort_unless(hash_equals((string) $locked->token_hash, $old)
                && $locked->token_expires_at?->isFuture(), 401,
                'Session expired or rotated.');
            $locked->forceFill(['token_hash' => hash('sha256', $token),
                'token_expires_at' => $expiry])->save();
        }, 3);

        return response()->json(['player_id' => $player->id, 'token' => $token,
            'token_expires_at' => $expiry->toIso8601String()])
            ->header('Cache-Control', 'no-store, private');
    }

    public function revoke(Request $request): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');
        $old = hash('sha256', (string) $request->bearerToken());
        DB::transaction(function () use ($player, $old): void {
            $locked = ArcadePlayer::query()->whereKey($player->id)->lockForUpdate()->firstOrFail();
            abort_unless(hash_equals((string) $locked->token_hash, $old), 401);
            // Non-null random hash + already-expired timestamp. Old credentials
            // cannot be revived by a timing race or a stale cookie.
            $locked->forceFill(['token_hash' => hash('sha256', Str::random(64)),
                'token_expires_at' => now()->subSecond()])->save();
        }, 3);

        return response()->json(['status' => 'revoked'])
            ->header('Cache-Control', 'no-store, private');
    }
}
