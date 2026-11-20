<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

final class PhoneIdentityService
{
    public function required(): bool
    {
        return ! app()->environment('testing') || config('demian-identity.required') === true;
    }

    public function ready(): bool
    {
        $key = config('demian-identity.key');
        return config('demian-identity.enabled') === true && is_string($key) && strlen($key) >= 32
            && app(IdentitySmsGateway::class)->configured();
    }

    public function digest(string $domain, string ...$parts): string
    {
        $key = config('demian-identity.key');
        if (! is_string($key) || strlen($key) < 32) throw new RuntimeException('Identity protection is not configured.');
        return hash_hmac('sha256', json_encode([$domain, ...$parts], JSON_THROW_ON_ERROR), $key);
    }

    public function identity(string $player): ?object
    {
        return DB::table('arcade_verified_phones')->where('player_id', $player)->first();
    }

    public function status(string $player): array
    {
        $row = $this->identity($player);
        return ['verified' => $row !== null, 'verified_at' => $row?->verified_at,
            'available' => $this->ready(), 'required_for_prizes' => $this->required()];
    }

    public static function validRecovery(ArcadePlayer $player, string $hash): bool
    {
        return ($player->recovery_hash === $hash && $player->recovery_expires_at?->isFuture())
            || ($player->backup_hash === $hash && $player->backup_expires_at?->isFuture());
    }

    private function reserveBucket(string $key, int $limit, int $seconds): void
    {
        DB::table('arcade_phone_limits')->insertOrIgnore([
            'bucket' => $key, 'count' => 0, 'expires_at' => now()->addSeconds($seconds),
        ]);
        $row = DB::table('arcade_phone_limits')->where('bucket', $key)->lockForUpdate()->first();
        if (! $row) throw new RuntimeException('OTP limiter invariant.');
        $expired = $row->expires_at <= now()->utc()->toDateTimeString();
        abort_if(! $expired && $row->count >= $limit, 429, 'Verification temporarily limited.');
        DB::table('arcade_phone_limits')->where('bucket', $key)->update([
            'count' => $expired ? 1 : (int) $row->count + 1,
            'expires_at' => $expired ? now()->addSeconds($seconds) : $row->expires_at,
        ]);
    }

    public function request(string $playerId, string $credentialHash, string $purpose, ?string $phone = null): array
    {
        abort_unless($this->ready(), 503, 'Phone verification is not available.');
        if (! in_array($purpose, ['enroll', 'recover'], true)) throw new RuntimeException('Invalid OTP purpose.');
        $id = (string) Str::uuid();
        $otp = sprintf('%06d', random_int(0, 999999));
        $number = DB::transaction(function () use ($playerId, $credentialHash, $purpose, $phone, $id, $otp): string {
            $player = ArcadePlayer::query()->whereKey($playerId)->lockForUpdate()->first();
            abort_unless($player, 422, 'Verification request invalid.');
            $verified = $this->identity($playerId);
            if ($purpose === 'enroll') {
                abort_unless(hash_equals($player->token_hash, $credentialHash) && $player->token_expires_at?->isFuture(), 401);
                abort_if($verified !== null, 409, 'Phone identity is already verified and cannot be replaced here.');
                abort_unless(is_string($phone), 422);
                if (config('demian-legal.require_acceptance')) {
                    abort_unless($player->legal_policy_version === config('demian-legal.version') && $player->legal_accepted_at, 428);
                }
            } else {
                abort_unless($verified && self::validRecovery($player, $credentialHash), 422, 'Verification request invalid.');
                $phone = Crypt::decryptString($verified->phone_ciphertext);
            }
            $phone = app(PlayerContact::class)->phone($phone);
            abort_unless(preg_match('/^\+[1-9][0-9]{7,14}$/D', $phone), 422, 'Invalid phone number.');
            $phoneHash = $this->digest('phone-v1', $phone);
            if ($purpose === 'recover' && ! hash_equals($verified->phone_hash, $phoneHash)) {
                throw new RuntimeException('Identity key or phone record mismatch.');
            }
            // Shared networks are not identity; durable phone/account quotas
            // remain effective across fresh browsers and parallel PHP workers.
            $this->reserveBucket($this->digest('otp-player-hour', $playerId), 3, 3600);
            $this->reserveBucket($this->digest('otp-phone-day', $phoneHash), 5, 86400);
            $this->reserveBucket($this->digest('otp-phone-cooldown', $phoneHash), 1, 60);
            DB::table('arcade_phone_challenges')->where('player_id', $playerId)
                ->where('purpose', $purpose)->whereNull('consumed_at')->update(['consumed_at' => now()]);
            $context = $this->digest('otp-context', $purpose, $credentialHash, $player->token_hash);
            DB::table('arcade_phone_challenges')->insert([
                'id' => $id, 'player_id' => $playerId, 'purpose' => $purpose,
                'context_hash' => $context, 'phone_hash' => $phoneHash,
                'phone_ciphertext' => Crypt::encryptString($phone),
                'code_hash' => $this->digest('otp-code', $id, $context, $otp),
                'attempts' => 0, 'expires_at' => now()->addMinutes(5), 'created_at' => now(),
            ]);
            return $phone;
        }, 3);
        // External delivery occurs after the quota/challenge commit. Failure
        // consumes the send budget, never produces a usable challenge.
        $sent = app(IdentitySmsGateway::class)->send($number, $otp, $id);
        if (! $sent) {
            DB::table('arcade_phone_challenges')->where('id', $id)->update(['consumed_at' => now()]);
            abort(503, 'Verification delivery unavailable.');
        }
        $updated = DB::table('arcade_phone_challenges')->where('id', $id)
            ->whereNull('consumed_at')->where('expires_at', '>', now())->update(['sent_at' => now()]);
        abort_unless($updated === 1, 409, 'Verification request superseded.');
        return ['challenge_id' => $id, 'expires_in' => 300];
    }

    /** Call inside the player-row transaction. Return null on invalid OTP so
     * failed attempts COMMIT; the controller returns an error afterwards. */
    private function consume(ArcadePlayer $player, string $purpose, string $credentialHash, string $id, string $otp): ?object
    {
        $row = DB::table('arcade_phone_challenges')->where('id', $id)
            ->where('player_id', $player->id)->where('purpose', $purpose)->lockForUpdate()->first();
        if (! $row || $row->consumed_at || ! $row->sent_at || $row->expires_at <= now()->utc()->toDateTimeString()
            || $row->attempts >= 5) return null;
        $context = $this->digest('otp-context', $purpose, $credentialHash, $player->token_hash);
        if (! hash_equals($row->context_hash, $context)) return null;
        $valid = hash_equals($row->code_hash, $this->digest('otp-code', $id, $context, $otp));
        $attempts = (int) $row->attempts + 1;
        DB::table('arcade_phone_challenges')->where('id', $id)->update([
            'attempts' => $attempts, 'consumed_at' => $valid || $attempts >= 5 ? now() : null,
        ]);
        return $valid ? $row : null;
    }

    public function confirm(string $playerId, string $tokenHash, string $id, string $otp, ?string $device): string
    {
        abort_unless($this->ready(), 503);
        return DB::transaction(function () use ($playerId, $tokenHash, $id, $otp, $device): string {
            $player = ArcadePlayer::query()->whereKey($playerId)->lockForUpdate()->first();
            abort_unless($player && hash_equals($player->token_hash, $tokenHash) && $player->token_expires_at?->isFuture(), 401);
            if ($this->identity($playerId)) return 'already_verified';
            $row = $this->consume($player, 'enroll', $tokenHash, $id, $otp);
            if (! $row) return 'invalid';
            // The database unique constraint handles concurrent verification.
            $phone = Crypt::decryptString($row->phone_ciphertext);
            if (! hash_equals($row->phone_hash, $this->digest('phone-v1', $phone))) throw new RuntimeException('Phone integrity mismatch.');
            $created = DB::table('arcade_verified_phones')->insertOrIgnore([
                'player_id' => $playerId, 'phone_hash' => $row->phone_hash,
                'phone_ciphertext' => $row->phone_ciphertext, 'verified_at' => now(),
            ]);
            if ($created !== 1) {
                app(ArcadeAntiCheat::class)->identityReview($playerId, 'duplicate_verified_phone', ['verified_collision' => true]);
                return 'duplicate';
            }
            // Previously minted bearer recovery capabilities predate this
            // stronger proof. Revoke and let the legitimate owner issue new ones.
            $player->update(['recovery_hash' => null, 'recovery_expires_at' => null,
                'backup_hash' => null, 'backup_expires_at' => null]);
            $this->observeDevice($playerId, $device);
            return 'verified';
        }, 3);
    }

    /** Called with locked player and valid recovery capability; does not rotate
     * the token until BOTH the recovery code and a fresh phone OTP pass. */
    public function recoverProof(ArcadePlayer $player, string $hash, ?string $id, ?string $otp): bool
    {
        $verified = $this->identity($player->id);
        if (! $verified) return true;
        if (! $this->ready() || ! $id || ! $otp) return false;
        $row = $this->consume($player, 'recover', $hash, $id, $otp);
        return $row !== null && hash_equals($verified->phone_hash, $row->phone_hash);
    }

    public function observeDevice(string $player, ?string $device): void
    {
        if (! $device || ! Str::isUuid($device) || ! $this->ready()) return;
        // A random, user-clearable installation ID; no fingerprinting, hardware
        // ID, browser mode detection, canvas, fonts, raw IP or user agent.
        $digest = $this->digest('device-month', now('UTC')->format('Y-m'), strtolower($device));
        DB::table('arcade_identity_devices')->upsert([
            ['player_id' => $player, 'digest' => $digest, 'last_seen' => now()],
        ], ['player_id', 'digest'], ['last_seen']);
        $accounts = DB::table('arcade_identity_devices')->where('digest', $digest)
            ->where('last_seen', '>=', now()->subDays(30))->distinct()->count('player_id');
        if ($accounts >= 3) app(ArcadeAntiCheat::class)->identityReview($player, 'shared_installation', ['accounts' => $accounts]);
    }

    public function prune(): array
    {
        return [
            'challenges' => DB::table('arcade_phone_challenges')->where('expires_at', '<=', now())->delete(),
            'limits' => DB::table('arcade_phone_limits')->where('expires_at', '<=', now())->delete(),
            'devices' => DB::table('arcade_identity_devices')->where('last_seen', '<', now()->subDays(30))->delete(),
            'award_claims' => DB::table('arcade_identity_awards')->where('expires_at', '<=', now())
                ->whereExists(fn ($q) => $q->selectRaw('1')->from('arcade_coupons as c')
                    ->whereColumn('c.winner_id', 'arcade_identity_awards.winner_id')
                    ->where(fn ($q) => $q->whereIn('c.status', ['redeemed', 'revoked'])->orWhere('c.expires_at', '<=', now())))
                ->delete(),
        ];
    }
}
