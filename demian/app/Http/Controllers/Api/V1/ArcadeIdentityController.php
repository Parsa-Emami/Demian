<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ArcadePlayer;
use App\Services\Arcade\PhoneIdentityService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

final class ArcadeIdentityController extends Controller
{
    private function private(array $data, int $status = 200): JsonResponse
    {
        return response()->json($data, $status)->header('Cache-Control', 'private, no-store');
    }

    public function status(Request $request, PhoneIdentityService $identity): JsonResponse
    {
        return $this->private($identity->status($request->attributes->get('arcade_player')->id));
    }

    public function requestCode(Request $request, PhoneIdentityService $identity): JsonResponse
    {
        $data = $request->validate(['phone' => ['required', 'string', 'max:32'], 'consent' => ['accepted']]);
        return $this->private($identity->request($request->attributes->get('arcade_player')->id,
            hash('sha256', $request->bearerToken()), 'enroll', $data['phone']), 202);
    }

    public function confirm(Request $request, PhoneIdentityService $identity): JsonResponse
    {
        $data = $request->validate(['challenge_id' => ['required', 'uuid'],
            'otp' => ['required', 'string', 'regex:/^[0-9]{6}$/D'], 'device_id' => ['nullable', 'uuid']]);
        $result = $identity->confirm($request->attributes->get('arcade_player')->id,
            hash('sha256', $request->bearerToken()), $data['challenge_id'], $data['otp'], $data['device_id'] ?? null);
        if ($result === 'duplicate') return $this->private(['message' => 'Phone is already associated with a verified account. Recover that account.'], 409);
        if ($result === 'invalid') return $this->private(['message' => 'Verification code invalid or expired.'], 422);
        return $this->private(['verified' => true]);
    }

    public function recoveryCode(Request $request, PhoneIdentityService $identity): JsonResponse
    {
        $data = $request->validate(['recovery_code' => ['required', 'string', 'size:64', 'regex:/^[A-Za-z0-9]{64}$/D']]);
        $hash = hash('sha256', $data['recovery_code']);
        $player = ArcadePlayer::query()->where(fn ($q) => $q->where('recovery_hash', $hash)->orWhere('backup_hash', $hash))->first();
        abort_unless($player && PhoneIdentityService::validRecovery($player, $hash), 422, 'Verification request invalid.');
        return $this->private($identity->request($player->id, $hash, 'recover'), 202);
    }
}
