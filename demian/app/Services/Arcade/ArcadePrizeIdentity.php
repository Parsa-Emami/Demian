<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/** Identity and financial eligibility belong to the server, not the browser. */
final class ArcadePrizeIdentity
{
    public function status(ArcadePlayer $player): array
    {
        $state = $player->contact_type === 'phone' && $player->contact_hash
            && $player->phone_verified_at ? 'phone_verified'
            : ($player->contact_hash ? 'registered_unverified' : 'guest');

        return [
            'status' => $state,
            'phone_verified' => $state === 'phone_verified',
            'phone_contact_registered' => $player->contact_type === 'phone' && $player->contact_hash !== null,
            'otp_available' => app(SmsOtpGateway::class)->ready(),
            'prize_identity_required' => config('demian-arcade.prize_identity_required') === true,
            'prize_identity_eligible' => $state === 'phone_verified',
        ];
    }

    /**
     * Legacy accounts remain playable; a verified server-side identity is
     * required before real financial awards if rollout is enabled.
     * Production issuance cannot silently opt out of the gate.
     */
    public function assertRolloutReady(): void
    {
        if (app()->environment('production')
            && config('demian-arcade.prize_identity_required') !== true) {
            throw new RuntimeException('Financial issuance requires an approved verified-phone rollout.');
        }
    }

    public function assertVerifiedRecipient(string $playerId): void
    {
        if (config('demian-arcade.prize_identity_required') !== true) {
            return;
        }
        if ($this->verifiedRecipientIds([$playerId]) === []) {
            throw new RuntimeException('Award recipient must verify their phone before issuance.');
        }
    }

    public function verifiedRecipientIds(array $playerIds): array
    {
        $verified = [];
        foreach (array_chunk($playerIds, 500) as $ids) {
            $matches = DB::table('arcade_players')
                ->whereIn('id', $ids)
                ->where('contact_type', 'phone')
                ->whereNotNull('contact_hash')
                ->whereNotNull('phone_verified_at')
                ->pluck('id')->all();
            array_push($verified, ...$matches);
        }

        return $verified;
    }
}
