<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_reward_batches', function (Blueprint $table): void {
            $table->string('period_key', 24)->primary();
            $table->foreign('period_key')->references('period_key')
                ->on('arcade_weekly_periods')->restrictOnDelete();
            $table->char('settlement_hash', 64);
            $table->char('policy_hash', 64);
            // Preserve exact canonical bytes for SHA-256 across MySQL JSON and SQLite.
            $table->longText('policy_snapshot');
            $table->unsignedInteger('coupon_count');
            $table->timestamp('issued_at');
            $table->timestamps();
        });

        Schema::create('arcade_coupons', function (Blueprint $table): void {
            $table->id();
            $table->string('period_key', 24);
            $table->foreign('period_key')->references('period_key')
                ->on('arcade_reward_batches')->restrictOnDelete();
            $table->unsignedBigInteger('winner_id')->unique();
            $table->foreign('winner_id')->references('id')
                ->on('arcade_weekly_winners')->restrictOnDelete();
            $table->foreignUuid('player_id')->nullable()
                ->constrained('arcade_players')->nullOnDelete();
            $table->string('game_id', 40);
            $table->unsignedTinyInteger('prize_rank');
            $table->unsignedTinyInteger('percent_off');
            $table->char('currency', 3);
            $table->unsignedBigInteger('minimum_minor');
            $table->unsignedBigInteger('cap_minor');
            $table->char('code_hash', 64)->unique();
            // Encrypted using Laravel Crypt / APP_KEY. No plaintext DB column.
            $table->text('code_ciphertext')->nullable();
            $table->string('status', 16)->default('available');
            $table->timestamp('expires_at');
            $table->timestamp('redeemed_at')->nullable();
            $table->timestamps();
            $table->index(['player_id', 'status', 'expires_at']);
            $table->index(['period_key', 'prize_rank']);
        });

        Schema::create('arcade_coupon_reservations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('coupon_id')->constrained('arcade_coupons')->restrictOnDelete();
            $table->string('merchant_id', 40);
            $table->string('order_id', 80);
            $table->string('state', 16)->default('reserved');
            $table->char('currency', 3);
            $table->unsignedBigInteger('order_total_minor');
            $table->unsignedBigInteger('discount_minor');
            $table->timestamp('expires_at');
            $table->timestamp('captured_at')->nullable();
            $table->timestamps();
            $table->unique(['merchant_id', 'order_id'], 'arcade_merchant_order_once');
            $table->index(['coupon_id', 'state', 'expires_at'], 'arcade_coupon_reserve_lookup');
        });

        Schema::create('arcade_coupon_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('coupon_id')->constrained('arcade_coupons')->restrictOnDelete();
            $table->string('event_type', 24);
            $table->string('actor', 20);
            $table->char('order_digest', 64)->nullable();
            $table->json('details');
            $table->timestamp('created_at');
            $table->index(['coupon_id', 'id']);
        });

        Schema::create('arcade_coupon_request_nonces', function (Blueprint $table): void {
            $table->char('nonce_hash', 64)->primary();
            $table->timestamp('expires_at');
            $table->timestamp('created_at');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_coupon_request_nonces');
        Schema::dropIfExists('arcade_coupon_events');
        Schema::dropIfExists('arcade_coupon_reservations');
        Schema::dropIfExists('arcade_coupons');
        Schema::dropIfExists('arcade_reward_batches');
    }
};
