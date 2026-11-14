<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_coupons', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('winner_id')->unique()->constrained('arcade_weekly_winners')->restrictOnDelete();
            $table->foreignUuid('player_id')->nullable()->constrained('arcade_players')->nullOnDelete();
            // Never persist plaintext discount codes or expose hashes in API responses.
            $table->char('code_hash', 64)->unique();
            $table->text('code_ciphertext');
            $table->string('policy_version', 40);
            $table->unsignedTinyInteger('discount_percent');
            $table->char('currency', 3);
            $table->unsignedBigInteger('min_order_minor');
            $table->unsignedBigInteger('max_discount_minor');
            $table->string('status', 16)->default('issued');
            $table->unsignedBigInteger('active_reservation_id')->nullable();
            $table->timestamp('issued_at');
            $table->timestamp('expires_at');
            $table->timestamp('redeemed_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['player_id', 'issued_at']);
            $table->index(['status', 'expires_at']);
        });

        Schema::create('arcade_coupon_reservations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('coupon_id')->constrained('arcade_coupons')->restrictOnDelete();
            // HMAC order reference; one discount per merchant order, forever.
            $table->char('order_hash', 64)->unique();
            $table->string('status', 16);
            $table->char('currency', 3);
            $table->unsignedBigInteger('subtotal_minor');
            $table->unsignedBigInteger('discount_minor');
            $table->timestamp('expires_at');
            $table->timestamp('committed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
            $table->index(['coupon_id', 'status']);
        });

        Schema::create('arcade_coupon_redemptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('coupon_id')->unique()->constrained('arcade_coupons')->restrictOnDelete();
            $table->foreignId('reservation_id')->unique()->constrained('arcade_coupon_reservations')->restrictOnDelete();
            $table->char('order_hash', 64)->unique();
            $table->char('currency', 3);
            $table->unsignedBigInteger('subtotal_minor');
            $table->unsignedBigInteger('discount_minor');
            $table->timestamp('redeemed_at');
        });

        Schema::create('arcade_coupon_shop_requests', function (Blueprint $table): void {
            $table->string('event_id', 80)->primary();
            $table->string('action', 24);
            $table->char('request_digest', 64);
            $table->unsignedSmallInteger('response_status');
            $table->text('response_body');
            $table->timestamp('created_at');
        });

        Schema::create('arcade_coupon_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('coupon_id')->constrained('arcade_coupons')->restrictOnDelete();
            $table->string('event_type', 32);
            $table->string('shop_event_id', 80)->nullable();
            $table->char('order_hash', 64)->nullable();
            $table->json('details');
            $table->timestamp('created_at');
            $table->index(['coupon_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_coupon_events');
        Schema::dropIfExists('arcade_coupon_shop_requests');
        Schema::dropIfExists('arcade_coupon_redemptions');
        Schema::dropIfExists('arcade_coupon_reservations');
        Schema::dropIfExists('arcade_coupons');
    }
};
