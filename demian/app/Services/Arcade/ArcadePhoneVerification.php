<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Genuine delivery only; short-lived HMAC challenge and row-level locks.
 * No browser-supplied phone, debug bypass, predictable OTP or API echo.
 */
final class ArcadePhoneVerification
{
    public function __construct(private readonly SmsOtpGateway $gateway) {}

    private function otpHash(ArcadePlayer $player, string $code): string
    {
        $secret = (string) config('app.key');
        abort_unless(strlen($secret) >= 24, 503, 'OTP secret unavailable.');
        return hash_hmac('sha256',
            'demian-otp|'.$player->id.'|'.$player->contact_hash.'|'.$code, $secret);
    }

    public function send(ArcadePlayer $player): array
    {
        abort_unless($this->gateway->ready(), 503, 'OTP is not configured.');
        return DB::transaction(function () use ($player): array {
            $locked = ArcadePlayer::query()->whereKey($player->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->contact_type === 'phone'
                && $locked->contact_hash && is_string($locked->contact_value), 422,
                'A phone contact is required to verify this account.');
            abort_if($locked->phone_verified_at !== null, 409, 'Phone already verified.');

            $challenge = DB::table('arcade_player_phone_challenges')
                ->where('player_id', $locked->id)->lockForUpdate()->first();
            $now = now()->utc();
            $windowOpen = $challenge && $now->lt(
                \Carbon\CarbonImmutable::parse($challenge->window_started_at, 'UTC')->addHour()
            );
            $count = $windowOpen ? (int) $challenge->sent_in_window : 0;
            abort_if($windowOpen && $count >= 5, 429,
                'Too many OTP deliveries. Retry later.');
            abort_if($challenge && $now->lt(
                \Carbon\CarbonImmutable::parse($challenge->sent_at, 'UTC')->addSeconds(60)
            ), 429, 'Wait before requesting another code.');

            $code = (string) random_int(100000, 999999);
            // The provider call must succeed before any active challenge
            // exists; rollback on failure. A 5-second network timeout caps lock.
            $this->gateway->send($locked->contact_value, $code);
            $expiry = $now->copy()->addMinutes(5);
            DB::table('arcade_player_phone_challenges')->updateOrInsert(
                ['player_id' => $locked->id],
                [
                    'contact_hash' => $locked->contact_hash,
                    'code_hash' => $this->otpHash($locked, $code),
                    'attempts' => 0,
                    'sent_in_window' => $count + 1,
                    'window_started_at' => $windowOpen
                        ? $challenge->window_started_at : $now,
                    'sent_at' => $now, 'expires_at' => $expiry,
                    'updated_at' => $now, 'created_at' => $challenge?->created_at ?? $now,
                ]
            );
            return ['status' => 'sent', 'expires_in_seconds' => 300,
                'retry_after_seconds' => 60];
        }, 3);
    }

    public function verify(ArcadePlayer $player, string $code): array
    {
        abort_unless($this->gateway->ready(), 503, 'OTP is not configured.');
        if (preg_match('/^[0-9]{6}$/D', $code) !== 1) {
            throw ValidationException::withMessages(['code' => 'Six digits are required.']);
        }
        // Invalid attempts MUST commit, so do not abort() inside transaction.
        $outcome = DB::transaction(function () use ($player, $code): string {
            $locked = ArcadePlayer::query()->whereKey($player->id)->lockForUpdate()->firstOrFail();
            if ($locked->phone_verified_at !== null) return 'already';
            if ($locked->contact_type !== 'phone' || ! $locked->contact_hash) return 'invalid';
            $challenge = DB::table('arcade_player_phone_challenges')
                ->where('player_id', $locked->id)->lockForUpdate()->first();
            if (! $challenge || $challenge->contact_hash !== $locked->contact_hash
                || $challenge->expires_at <= now()->utc()->toDateTimeString()
                || (int) $challenge->attempts >= 5) {
                return 'invalid';
            }
            if (! hash_equals($challenge->code_hash, $this->otpHash($locked, $code))) {
                DB::table('arcade_player_phone_challenges')
                    ->where('player_id', $locked->id)
                    ->update(['attempts' => (int) $challenge->attempts + 1,
                        'updated_at' => now()]);
                return 'invalid';
            }
            $locked->forceFill(['phone_verified_at' => now()])->save();
            DB::table('arcade_player_phone_challenges')
                ->where('player_id', $locked->id)->delete();
            return 'verified';
        }, 3);

        if ($outcome === 'already') return ['status' => 'phone_verified'];
        if ($outcome !== 'verified') {
            throw ValidationException::withMessages([
                'code' => 'Code invalid, expired or attempts exhausted.',
            ]);
        }
        return ['status' => 'phone_verified'];
    }
}
