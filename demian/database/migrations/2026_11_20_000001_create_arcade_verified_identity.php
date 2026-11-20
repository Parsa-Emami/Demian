<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_verified_phones', function (Blueprint $table): void {
            $table->foreignUuid('player_id')->primary()->constrained('arcade_players')->cascadeOnDelete();
            $table->char('phone_hash', 64)->unique();
            $table->text('phone_ciphertext');
            $table->timestamp('verified_at');
        });
        Schema::create('arcade_phone_challenges', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('player_id')->constrained('arcade_players')->cascadeOnDelete();
            $table->string('purpose', 12);
            $table->char('context_hash', 64);
            $table->char('phone_hash', 64);
            $table->text('phone_ciphertext');
            $table->char('code_hash', 64);
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamp('consumed_at')->nullable();
            $table->timestamp('created_at');
            $table->index(['player_id', 'purpose', 'created_at'], 'arcade_phone_challenge_player');
        });
        Schema::create('arcade_phone_limits', function (Blueprint $table): void {
            $table->char('bucket', 64)->primary();
            $table->unsignedSmallInteger('count');
            $table->timestamp('expires_at')->index();
        });
        Schema::create('arcade_identity_devices', function (Blueprint $table): void {
            $table->id();
            $table->foreignUuid('player_id')->constrained('arcade_players')->cascadeOnDelete();
            $table->char('digest', 64);
            $table->timestamp('last_seen')->index();
            $table->unique(['player_id', 'digest'], 'arcade_identity_device_player');
            $table->index(['digest', 'last_seen']);
        });
        // No phone, stable identity hash, account ID or device ID in this ledger.
        // A week-scoped keyed digest remains briefly after account erasure.
        Schema::create('arcade_identity_awards', function (Blueprint $table): void {
            $table->id();
            $table->string('period_key', 24);
            $table->char('identity_digest', 64);
            $table->foreignId('winner_id')->unique()->constrained('arcade_weekly_winners')->restrictOnDelete();
            $table->timestamp('blocked_until');
            $table->timestamp('expires_at')->index();
            $table->unique(['period_key', 'identity_digest'], 'arcade_one_identity_weekly_award');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_identity_awards');
        Schema::dropIfExists('arcade_identity_devices');
        Schema::dropIfExists('arcade_phone_limits');
        Schema::dropIfExists('arcade_phone_challenges');
        Schema::dropIfExists('arcade_verified_phones');
    }
};
