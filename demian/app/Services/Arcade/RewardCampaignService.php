<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class RewardCampaignService
{
    private function gate(): void
    {
        abort_unless(config('demian-coupons.campaigns_enabled') === true
            && config('demian-coupons.cafe_enabled') === true
            && config('demian-coupons.policy_approved') === true, 503,
            'Reward campaign management is not approved or enabled.');
    }

    private function actor(int $id, int $version): object
    {
        $staff = DB::table('arcade_cashier_staff')->where('id', $id)
            ->lockForUpdate()->first();
        CafeAccess::authorizeGift($staff);
        abort_unless((int) $staff->session_version === $version, 403,
            'Administrative session changed.');

        return $staff;
    }

    private function terms(array $data): array
    {
        $approved = app(CouponPolicy::class)->approved();
        $percent = [
            1 => (int) ($data['percent_first'] ?? $approved['ranks'][1]),
            2 => (int) ($data['percent_second'] ?? $approved['ranks'][2]),
            3 => (int) ($data['percent_third'] ?? $approved['ranks'][3]),
        ];
        $other = (int) ($data['percent_other'] ?? $approved['ranks'][4]);
        foreach (range(4, 10) as $rank) $percent[$rank] = $other;
        foreach ($percent as $rank => $rate) {
            if ($rate < 1 || $rate > $approved['ranks'][$rank]
                || ($rank > 1 && $rate > $percent[$rank - 1])) {
                throw new RuntimeException('Discount tiers exceed approved limits or ordering.');
            }
        }
        $minimum = (int) ($data['min_order_minor'] ?? $approved['min_order_minor']);
        $maximum = (int) ($data['max_discount_minor'] ?? $approved['max_discount_minor']);
        $days = (int) ($data['valid_days'] ?? $approved['valid_days']);
        if ($minimum < $approved['min_order_minor'] || $minimum > 1000000000000
            || $maximum < 1 || $maximum > $approved['max_discount_minor']
            || $days < 1 || $days > $approved['valid_days']) {
            throw new RuntimeException('Campaign terms exceed approved business limits.');
        }

        return [
            'version' => $approved['version'], 'currency' => $approved['currency'],
            'ranks' => $percent, 'min_order_minor' => $minimum,
            'max_discount_minor' => $maximum, 'valid_days' => $days,
        ];
    }

    private function log(int $campaignId, ?int $actorId, string $event, array $details): void
    {
        DB::table('arcade_reward_campaign_events')->insert([
            'campaign_id' => $campaignId, 'actor_id' => $actorId,
            'event_type' => $event,
            'details' => json_encode($details, JSON_THROW_ON_ERROR),
            'created_at' => now(),
        ]);
    }

    private function assertEditableWeek(string $key): object
    {
        if (! preg_match('/^weekly:tehran:\d{4}-\d{2}-\d{2}$/D', $key)) {
            throw new RuntimeException('Invalid weekly period key.');
        }
        $week = DB::table('arcade_weekly_periods')->where('period_key', $key)
            ->lockForUpdate()->first();
        if (! $week || $week->status !== 'open'
            || CarbonImmutable::parse($week->starts_at, 'UTC')->lte(CarbonImmutable::now('UTC'))) {
            throw new RuntimeException('Only prepared future weeks can configure reward campaigns.');
        }

        return $week;
    }

    public function create(int $actorId, int $version, array $data): int
    {
        $this->gate();

        return DB::transaction(function () use ($actorId, $version, $data): int {
            $this->actor($actorId, $version);
            $key = (string) $data['period_key'];
            $this->assertEditableWeek($key);
            if (DB::table('arcade_reward_campaigns')->where('period_key', $key)->exists()) {
                throw new RuntimeException('This week already has a campaign.');
            }
            $title = trim((string) $data['title']);
            $capacity = (int) $data['max_awards'];
            if ($title === '' || mb_strlen($title) > 100 || $capacity < 1 || $capacity > 200) {
                throw new RuntimeException('Invalid campaign name or award capacity.');
            }
            $terms = $this->terms($data);
            $payload = json_encode($terms, JSON_THROW_ON_ERROR);
            $id = DB::table('arcade_reward_campaigns')->insertGetId([
                'period_key' => $key, 'title' => $title, 'status' => 'draft',
                'max_awards' => $capacity, 'terms' => $payload,
                'terms_hash' => hash('sha256', $payload), 'created_by' => $actorId,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->log($id, $actorId, 'created', [
                'period_key' => $key, 'max_awards' => $capacity,
                'terms_hash' => hash('sha256', $payload),
            ]);

            return $id;
        }, 3);
    }

    public function revise(int $actorId, int $version, int $campaignId, array $data): void
    {
        $this->gate();
        DB::transaction(function () use ($actorId, $version, $campaignId, $data): void {
            $this->actor($actorId, $version);
            $campaign = DB::table('arcade_reward_campaigns')->where('id', $campaignId)
                ->lockForUpdate()->first();
            if (! $campaign || $campaign->status !== 'draft') {
                throw new RuntimeException('Only a draft campaign can be revised.');
            }
            $this->assertEditableWeek($campaign->period_key);
            $title = trim((string) $data['title']);
            $capacity = (int) $data['max_awards'];
            if ($title === '' || mb_strlen($title) > 100 || $capacity < 1 || $capacity > 200) {
                throw new RuntimeException('Invalid campaign name or capacity.');
            }
            $terms = $this->terms($data);
            $payload = json_encode($terms, JSON_THROW_ON_ERROR);
            DB::table('arcade_reward_campaigns')->where('id', $campaignId)->update([
                'title' => $title, 'max_awards' => $capacity,
                'terms' => $payload, 'terms_hash' => hash('sha256', $payload),
                'updated_at' => now(),
            ]);
            $this->log($campaignId, $actorId, 'revised', [
                'max_awards' => $capacity, 'terms_hash' => hash('sha256', $payload),
            ]);
        }, 3);
    }

    public function import(int $actorId, int $version, int $campaignId,
        string $requestKey, string $rawCodes): array
    {
        $this->gate();
        if (! preg_match('/^[a-f0-9-]{36}$/iD', $requestKey)) {
            throw new RuntimeException('Invalid import idempotency key.');
        }
        $codes = array_values(array_filter(array_map(
            fn (string $value): string => strtoupper(trim($value)),
            preg_split('/[\r\n,;]+/', $rawCodes) ?: []
        ), fn (string $value): bool => $value !== ''));
        if ($codes === [] || count($codes) > 200 || count($codes) !== count(array_unique($codes))) {
            throw new RuntimeException('Import must contain 1–200 unique codes.');
        }
        foreach ($codes as $code) {
            if (! preg_match('/^DMC-[A-F0-9]{32}$/D', $code)) {
                throw new RuntimeException('Invalid cafe coupon format; no codes imported.');
            }
        }
        $hashes = array_map(fn (string $code): string => hash('sha256', $code), $codes);
        $digestValues = $hashes;
        sort($digestValues, SORT_STRING);
        $digest = hash('sha256', implode("\n", $digestValues));

        return DB::transaction(function () use ($actorId, $version, $campaignId, $requestKey,
            $codes, $hashes, $digest): array {
            $this->actor($actorId, $version);
            $campaign = DB::table('arcade_reward_campaigns')->where('id', $campaignId)
                ->lockForUpdate()->first();
            if (! $campaign || ! in_array($campaign->status, ['draft', 'active', 'paused'], true)) {
                throw new RuntimeException('Cannot import into a closed or missing campaign.');
            }
            $previous = DB::table('arcade_reward_import_batches')
                ->where('request_key', $requestKey)->first();
            if ($previous) {
                if ((int) $previous->campaign_id !== $campaignId
                    || ! hash_equals($previous->request_digest, $digest)) {
                    throw new RuntimeException('Import key has conflicting contents.');
                }

                return ['imported' => 0, 'existing' => (int) $previous->code_count];
            }
            if (DB::table('arcade_reward_inventory')->whereIn('code_hash', $hashes)->exists()
                || DB::table('arcade_coupons')->whereIn('code_hash', $hashes)->exists()) {
                throw new RuntimeException('One or more imported codes were used before.');
            }
            $batchId = DB::table('arcade_reward_import_batches')->insertGetId([
                'campaign_id' => $campaignId, 'request_key' => $requestKey,
                'request_digest' => $digest, 'code_count' => count($codes),
                'actor_id' => $actorId, 'created_at' => now(),
            ]);
            $rows = [];
            foreach ($codes as $index => $code) {
                $rows[] = [
                    'campaign_id' => $campaignId, 'batch_id' => $batchId,
                    'code_hash' => $hashes[$index],
                    'code_ciphertext' => Crypt::encryptString($code),
                    'status' => 'available', 'created_at' => now(), 'updated_at' => now(),
                ];
            }
            DB::table('arcade_reward_inventory')->insert($rows);
            $this->log($campaignId, $actorId, 'imported', [
                'batch_id' => $batchId, 'count' => count($rows),
                'request_digest' => $digest,
            ]);

            return ['imported' => count($rows), 'existing' => 0];
        }, 3);
    }

    public function transition(int $actorId, int $version, int $campaignId, string $action): void
    {
        $this->gate();
        DB::transaction(function () use ($actorId, $version, $campaignId, $action): void {
            $this->actor($actorId, $version);
            $campaign = DB::table('arcade_reward_campaigns')->where('id', $campaignId)
                ->lockForUpdate()->first();
            if (! $campaign) throw new RuntimeException('Campaign not found.');
            $expected = match ($action) {
                'activate' => ['draft', 'paused'],
                'pause' => ['active'],
                'close' => ['draft', 'active', 'paused'],
                default => [],
            };
            if (! in_array($campaign->status, $expected, true)) {
                throw new RuntimeException('Invalid campaign state transition.');
            }
            if ($action === 'activate') {
                $period = DB::table('arcade_weekly_periods')
                    ->where('period_key', $campaign->period_key)->first();
                if (! $period || $period->status !== 'open') {
                    throw new RuntimeException('Cannot activate rewards after weekly settlement.');
                }
                $covered = DB::table('arcade_reward_inventory')
                    ->where('campaign_id', $campaignId)
                    ->whereIn('status', ['available', 'assigned'])->count();
                if ($covered < (int) $campaign->max_awards) {
                    throw new RuntimeException('Campaign inventory does not cover promised awards.');
                }
            }
            $next = match ($action) {
                'activate' => 'active', 'pause' => 'paused', 'close' => 'closed',
            };
            DB::table('arcade_reward_campaigns')->where('id', $campaignId)->update([
                'status' => $next,
                'activated_at' => $action === 'activate'
                    ? ($campaign->activated_at ?? now()) : $campaign->activated_at,
                'closed_at' => $action === 'close' ? now() : $campaign->closed_at,
                'updated_at' => now(),
            ]);
            $this->log($campaignId, $actorId, $next, ['previous' => $campaign->status]);
        }, 3);
    }

    public function voidCode(int $actorId, int $version, int $inventoryId): void
    {
        $this->gate();
        DB::transaction(function () use ($actorId, $version, $inventoryId): void {
            $this->actor($actorId, $version);
            $lookup = DB::table('arcade_reward_inventory')
                ->where('id', $inventoryId)->first();
            if (! $lookup) throw new RuntimeException('Inventory not found.');
            $campaign = DB::table('arcade_reward_campaigns')
                ->where('id', $lookup->campaign_id)->lockForUpdate()->first();
            $item = DB::table('arcade_reward_inventory')
                ->where('id', $inventoryId)->lockForUpdate()->first();
            if (! $campaign || $campaign->status === 'closed'
                || ! $item || $item->campaign_id !== $campaign->id
                || $item->status !== 'available') {
                throw new RuntimeException('Only unassigned open-campaign inventory can be voided.');
            }
            if ($campaign->status === 'active') {
                $remaining = DB::table('arcade_reward_inventory')
                    ->where('campaign_id', $campaign->id)
                    ->whereIn('status', ['available', 'assigned'])->count();
                if ($remaining <= (int) $campaign->max_awards) {
                    throw new RuntimeException('Voiding this code would break active award coverage.');
                }
            }
            DB::table('arcade_reward_inventory')->where('id', $inventoryId)->update([
                'status' => 'void', 'code_ciphertext' => null,
                'voided_at' => now(), 'updated_at' => now(),
            ]);
            $this->log((int) $item->campaign_id, $actorId, 'voided', [
                'inventory_id' => $inventoryId,
            ]);
        }, 3);
    }

    public function lockedForIssuance(string $periodKey, int $winnerCount,
        int $missing): object
    {
        $this->gate();
        $campaign = DB::table('arcade_reward_campaigns')
            ->where('period_key', $periodKey)->lockForUpdate()->first();
        if (! $campaign) throw new RuntimeException('Approved inventory campaign is required.');
        if (! hash_equals($campaign->terms_hash, hash('sha256', $campaign->terms))) {
            throw new RuntimeException('Frozen campaign terms checksum mismatch.');
        }
        if ($winnerCount > (int) $campaign->max_awards) {
            throw new RuntimeException('Weekly winners exceed approved campaign award capacity.');
        }
        if ($missing > 0) {
            if ($campaign->status !== 'active') {
                throw new RuntimeException('Campaign is not active for issuance.');
            }
            $available = DB::table('arcade_reward_inventory')
                ->where('campaign_id', $campaign->id)->where('status', 'available')->count();
            if ($available < $missing) {
                throw new RuntimeException('Insufficient unassigned campaign codes; no awards issued.');
            }
        }

        return $campaign;
    }

    public function claim(object $campaign): object
    {
        $item = DB::table('arcade_reward_inventory')
            ->where('campaign_id', $campaign->id)->where('status', 'available')
            ->orderBy('id')->lockForUpdate()->first();
        if (! $item || !$item->code_ciphertext) {
            throw new RuntimeException('Campaign code inventory exhausted.');
        }
        $plaintext = Crypt::decryptString($item->code_ciphertext);
        if (! preg_match('/^DMC-[A-F0-9]{32}$/D', $plaintext)
            || ! hash_equals($item->code_hash, hash('sha256', $plaintext))) {
            throw new RuntimeException('Imported campaign code integrity failure.');
        }

        return $item;
    }

    public function assign(int $inventoryId, int $couponId, int $campaignId): void
    {
        $updated = DB::table('arcade_reward_inventory')
            ->where('id', $inventoryId)->where('campaign_id', $campaignId)
            ->where('status', 'available')->update([
                'status' => 'assigned', 'coupon_id' => $couponId,
                'code_ciphertext' => null, 'assigned_at' => now(), 'updated_at' => now(),
            ]);
        if ($updated !== 1) throw new RuntimeException('Concurrent code assignment rejected.');
        $this->log($campaignId, null, 'assigned', [
            'inventory_id' => $inventoryId, 'coupon_id' => $couponId,
        ]);
    }

    public function dashboard(): array
    {
        $this->gate();
        return DB::table('arcade_reward_campaigns')->orderByDesc('id')
            ->limit(30)->get()->map(function (object $campaign): array {
                $inventory = DB::table('arcade_reward_inventory')
                    ->where('campaign_id', $campaign->id)
                    ->selectRaw('status, COUNT(*) AS total')->groupBy('status')
                    ->pluck('total', 'status');
                return [
                    'id' => (int) $campaign->id, 'title' => $campaign->title,
                    'period_key' => $campaign->period_key, 'status' => $campaign->status,
                    'max_awards' => (int) $campaign->max_awards,
                    'available' => (int) ($inventory['available'] ?? 0),
                    'assigned' => (int) ($inventory['assigned'] ?? 0),
                    'void' => (int) ($inventory['void'] ?? 0),
                    'available_ids' => DB::table('arcade_reward_inventory')
                        ->where('campaign_id', $campaign->id)->where('status', 'available')
                        ->orderBy('id')->limit(15)->pluck('id')->all(),
                    'terms' => json_decode($campaign->terms, true, 512, JSON_THROW_ON_ERROR),
                ];
            })->all();
    }
}
