<?php

namespace Tests\Feature;

use App\Services\Arcade\BrowserPushService;
use App\Services\Arcade\BrowserPushTransport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Minishlink\WebPush\VAPID;
use Tests\TestCase;

final class BrowserPushTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/arcade/player/push/subscription';

    private function enable(): string
    {
        $keys = VAPID::createVapidKeys();
        config()->set([
            'demian-push.enabled' => true, 'demian-push.subject' => 'mailto:game@example.test',
            'demian-push.public_key' => $keys['publicKey'], 'demian-push.private_key' => $keys['privateKey'],
        ]);

        return $keys['publicKey'];
    }

    private function player(string $name): array
    {
        return $this->postJson('/api/v1/arcade/players', ['display_name' => $name])->assertCreated()->json();
    }

    private function browser(string $name): array
    {
        return [
            'endpoint' => 'https://updates.push.services.mozilla.com/wpush/v2/'.$name,
            'keys' => ['p256dh' => VAPID::createVapidKeys()['publicKey'], 'auth' => str_repeat('A', 22)],
        ];
    }

    public function test_player_consent_validation_ownership_and_erasure(): void
    {
        $device = $this->browser('demian-test-a');
        $player = $this->player('Push player A');
        $other = $this->player('Push player B');
        $this->getJson('/api/v1/arcade/push/config')->assertExactJson(['enabled' => false, 'public_key' => null]);
        $this->postJson(self::URL, $device)->assertUnauthorized();
        $this->withToken($player['token'])->postJson(self::URL, $device)->assertServiceUnavailable();
        $key = $this->enable();
        $this->getJson('/api/v1/arcade/push/config')->assertExactJson(['enabled' => true, 'public_key' => $key]);
        foreach ([
            'http://updates.push.services.mozilla.com/wpush/a',
            'https://127.0.0.1/push', 'https://fcm.googleapis.com.example.test/push',
            'https://fcm.googleapis.com:9443/push', 'https://name:secret@fcm.googleapis.com/push',
        ] as $rejected) {
            $this->postJson(self::URL, [...$device, 'endpoint' => $rejected])->assertUnprocessable();
        }
        $this->postJson(self::URL, [...$device, 'keys' => ['p256dh' => str_repeat('A', 87), 'auth' => str_repeat('A', 22)]])
            ->assertUnprocessable();
        $this->postJson(self::URL, $device)->assertNoContent();
        $this->postJson(self::URL, $device)->assertNoContent();
        $this->assertDatabaseCount('arcade_push_subscriptions', 1);
        $this->assertStringNotContainsString($device['endpoint'], DB::table('arcade_push_subscriptions')->value('ciphertext'));
        $this->getJson('/api/v1/arcade/player/data/records?type=browser_push')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonMissingPath('data.0.ciphertext');
        $this->withToken($other['token'])->postJson(self::URL, $device)->assertConflict();
        $this->deleteJson(self::URL, ['endpoint' => $device['endpoint']])->assertNoContent();
        $this->assertDatabaseCount('arcade_push_subscriptions', 1);
        $this->withToken($player['token'])->deleteJson('/api/v1/arcade/player')->assertOk();
        $this->assertDatabaseCount('arcade_push_subscriptions', 0);
    }

    public function test_superadmin_publication_and_bounded_provider_retries(): void
    {
        $this->enable();
        $player = $this->player('Notification recipient');
        $this->withToken($player['token'])->postJson(self::URL, $this->browser('demian-test-b'))->assertNoContent();
        $staff = DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'push-owner', 'display_name' => 'Test owner', 'password_hash' => Hash::make('fixture-password'),
            'branch_id' => 'main', 'role' => 'admin', 'session_version' => 1, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $route = '/cashier/admin/browser-push';
        config()->set('demian-coupons.cafe_enabled', true);
        $this->withSession(['cafe_staff_id' => $staff, 'cafe_staff_version' => 1, 'cafe_authenticated_at' => now()->timestamp]);
        $this->get($route)->assertForbidden();
        DB::table('arcade_cashier_staff')->where('id', $staff)->update(['role' => 'super_admin']);
        config()->set('demian-coupons.cafe_enabled', false);
        $this->get($route)->assertOk()->assertSee('اعلان مرورگر');
        $this->post('/cashier/lookup', [])->assertServiceUnavailable();
        $notice = ['request_id' => (string) Str::uuid(), 'title' => 'خبر دمیان', 'body' => 'جدول تازه شد',
            'target' => 'leaderboard', 'confirmed' => 1, 'password' => 'fixture-password'];
        $this->post($route, [...$notice, 'password' => 'wrong'])->assertForbidden();
        $this->post($route, $notice)->assertRedirect($route);
        $this->post($route, $notice)->assertRedirect($route);
        $this->assertDatabaseCount('arcade_push_notices', 1);
        $this->assertDatabaseCount('arcade_push_deliveries', 1);
        $transport = new class extends BrowserPushTransport
        {
            public array $observed = [];

            public int $response = 429;

            public function send(array $auth, array $batch): array
            {
                $this->observed = array_values($batch);

                return array_fill_keys(array_keys($batch), $this->response);
            }
        };
        $push = app(BrowserPushService::class);
        $this->assertSame(1, $push->drain($transport)['retry']);
        $this->assertSame($notice['request_id'], $transport->observed[0]['payload']['id']);
        $this->assertSame('leaderboard', $transport->observed[0]['payload']['target']);
        $this->assertSame(0, $push->drain($transport)['retry']);
        $this->travel(2)->minutes();
        $transport->response = 201;
        $this->assertSame(1, $push->drain($transport)['sent']);
        $this->assertSame(1, $push->recent()[0]['accepted']);
        $push->enqueue('Second notice', 'A browser fixture', 'home');
        $transport->response = 410;
        $this->assertSame(1, $push->drain($transport)['expired']);
        $this->assertDatabaseCount('arcade_push_subscriptions', 0);
    }
}
