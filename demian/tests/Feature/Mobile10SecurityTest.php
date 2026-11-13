<?php

namespace Tests\Feature;

use App\Models\ArcadePlayer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class Mobile10SecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_token_has_absolute_expiry_and_expired_token_cannot_access_player_or_delete(): void
    {
        $player = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Secure'])
            ->assertCreated()->assertHeader('Cache-Control', 'no-store, private')
            ->json();
        $this->assertNotNull($player['token_expires_at']);
        $this->assertSame(64, strlen($player['token']));
        $this->assertDatabaseHas('arcade_players', ['id' => $player['player_id'],
            'token_hash' => hash('sha256', $player['token'])]);
        $this->withToken($player['token'])->getJson('/api/v1/arcade/player')->assertOk();

        ArcadePlayer::query()->findOrFail($player['player_id'])
            ->update(['token_expires_at' => now()->subSecond()]);
        $this->getJson('/api/v1/arcade/player')->assertUnauthorized();
        $this->deleteJson('/api/v1/arcade/player')->assertUnauthorized();
        $this->assertDatabaseCount('arcade_players', 1);
    }

    public function test_recovery_is_expiring_single_use_rotates_bearer_and_removes_old_capability(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $player = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Recover'])
            ->assertCreated()->json();
        $code = $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/player/recovery-link')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')->json();
        $this->assertNotNull($code['recovery_expires_at']);
        $this->assertDatabaseHas('arcade_players', ['id' => $player['player_id'],
            'recovery_hash' => hash('sha256', $code['recovery_code'])]);
        $this->postJson('/api/v1/arcade/players/recover',
            ['recovery_code' => $code['recovery_code']])->assertOk()
            ->assertJsonStructure(['token', 'token_expires_at', 'player_id']);
        $this->postJson('/api/v1/arcade/players/recover',
            ['recovery_code' => $code['recovery_code']])->assertUnprocessable();
        $this->withToken($player['token'])->getJson('/api/v1/arcade/player')
            ->assertUnauthorized();
    }

    public function test_expired_recovery_does_not_invalidate_current_session(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $player = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Expire'])
            ->assertCreated()->json();
        $code = $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/player/recovery-link')->assertOk()->json('recovery_code');
        DB::table('arcade_players')->where('id', $player['player_id'])
            ->update(['recovery_expires_at' => now()->subSecond()]);
        $this->postJson('/api/v1/arcade/players/recover', ['recovery_code' => $code])
            ->assertUnprocessable();
        $this->withToken($player['token'])->getJson('/api/v1/arcade/player')
            ->assertOk()->assertJsonPath('player_id', $player['player_id']);
    }

    public function test_reissue_revokes_old_recovery_secret_with_new_expiry(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $player = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Reissue'])
            ->assertCreated()->json();
        $this->withToken($player['token']);
        $one = $this->postJson('/api/v1/arcade/player/recovery-link')
            ->assertOk()->json('recovery_code');
        $two = $this->postJson('/api/v1/arcade/player/recovery-link')
            ->assertOk()->json('recovery_code');
        $this->assertNotSame($one, $two);
        $this->postJson('/api/v1/arcade/players/recover',
            ['recovery_code' => $one])->assertUnprocessable();
        $this->postJson('/api/v1/arcade/players/recover',
            ['recovery_code' => $two])->assertOk();
    }


    public function test_recovery_issuance_is_limited_per_player_even_if_ip_throttles_are_disabled(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $player = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Limited'])
            ->assertCreated()->json();
        $this->withToken($player['token']);
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/v1/arcade/player/recovery-link')->assertOk();
        }
        $this->postJson('/api/v1/arcade/player/recovery-link')->assertStatus(429);
    }


    public function test_long_lived_backup_recovers_expired_session_and_revokes_both_recovery_grants(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $player = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Backup'])
            ->assertCreated()->json();
        $this->withToken($player['token']);
        $backup = $this->postJson('/api/v1/arcade/player/backup-code')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')->json();
        $link = $this->postJson('/api/v1/arcade/player/recovery-link')
            ->assertOk()->json('recovery_code');

        $this->assertSame(64, strlen($backup['backup_code']));
        $this->assertNotNull($backup['backup_expires_at']);
        $this->assertDatabaseHas('arcade_players', ['id' => $player['player_id'],
            'backup_hash' => hash('sha256', $backup['backup_code'])]);
        DB::table('arcade_players')->where('id', $player['player_id'])
            ->update(['token_expires_at' => now()->subSecond()]);
        $this->getJson('/api/v1/arcade/player')->assertUnauthorized();

        $new = $this->postJson('/api/v1/arcade/players/recover',
            ['recovery_code' => $backup['backup_code']])->assertOk()->json();
        $this->assertSame($player['player_id'], $new['player_id']);
        $this->assertNotSame($player['token'], $new['token']);
        $this->postJson('/api/v1/arcade/players/recover',
            ['recovery_code' => $backup['backup_code']])->assertUnprocessable();
        $this->postJson('/api/v1/arcade/players/recover',
            ['recovery_code' => $link])->assertUnprocessable();
        $this->withToken($new['token'])->getJson('/api/v1/arcade/player')
            ->assertOk()->assertJsonPath('player_id', $player['player_id']);
        $this->assertDatabaseHas('arcade_players', ['id' => $player['player_id'],
            'backup_hash' => null, 'recovery_hash' => null]);
    }

    public function test_expired_backup_is_rejected_and_cannot_rotate_a_live_session(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $player = $this->postJson('/api/v1/arcade/players', ['display_name' => 'OldBackup'])
            ->assertCreated()->json();
        $code = $this->withToken($player['token'])->postJson('/api/v1/arcade/player/backup-code')
            ->assertOk()->json('backup_code');
        DB::table('arcade_players')->where('id', $player['player_id'])
            ->update(['backup_expires_at' => now()->subSecond()]);
        $this->postJson('/api/v1/arcade/players/recover', ['recovery_code' => $code])
            ->assertUnprocessable();
        $this->withToken($player['token'])->getJson('/api/v1/arcade/player')->assertOk();
    }

    public function test_backup_code_issuance_is_bounded_per_player(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $player = $this->postJson('/api/v1/arcade/players', ['display_name' => 'BackupLimit'])
            ->assertCreated()->json();
        $this->withToken($player['token']);
        $this->postJson('/api/v1/arcade/player/backup-code')->assertOk();
        $this->postJson('/api/v1/arcade/player/backup-code')->assertOk();
        $this->postJson('/api/v1/arcade/player/backup-code')->assertStatus(429);
    }

    public function test_cors_includes_authenticated_account_deletion_verb(): void
    {
        $this->assertContains('DELETE', config('cors.allowed_methods'));
        $this->assertSame(false, config('cors.supports_credentials'));
        $this->assertNotContains('*', config('cors.allowed_origins'));
    }
}
