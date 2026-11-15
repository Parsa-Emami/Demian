<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_coupon_delivery_receipts', function (Blueprint $table): void {
            $table->foreignId('coupon_id')->primary()
                ->constrained('arcade_coupons')->restrictOnDelete();
            $table->foreignUuid('player_id')->nullable()
                ->constrained('arcade_players')->nullOnDelete();
            $table->timestamp('acknowledged_at');
            $table->index(['player_id', 'acknowledged_at']);
        });

        Schema::create('arcade_coupon_disputes', function (Blueprint $table): void {
            $table->id();
            $table->uuid('request_key')->unique();
            $table->char('request_digest', 64);
            $table->foreignId('coupon_id')
                ->constrained('arcade_coupons')->restrictOnDelete();
            $table->foreignUuid('player_id')->nullable()
                ->constrained('arcade_players')->nullOnDelete();
            // Unique, nullable: at most one unresolved ticket per coupon.
            // A new ticket may be filed after the previous case closes.
            $table->unsignedBigInteger('open_coupon_id')->nullable()->unique();
            $table->foreign('open_coupon_id')->references('id')
                ->on('arcade_coupons')->restrictOnDelete();
            $table->string('category', 24);
            $table->string('description', 300)->nullable();
            $table->string('status', 16)->default('open');
            $table->string('resolution', 24)->nullable();
            $table->string('resolution_note', 300)->nullable();
            $table->foreignId('resolved_by')->nullable()
                ->constrained('arcade_cashier_staff')->nullOnDelete();
            $table->foreignId('replacement_coupon_id')->nullable()->unique()
                ->constrained('arcade_coupons')->restrictOnDelete();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
            $table->index(['player_id', 'created_at']);
            $table->index(['coupon_id', 'id']);
        });

        Schema::create('arcade_coupon_dispute_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('dispute_id')->constrained('arcade_coupon_disputes')
                ->restrictOnDelete();
            $table->foreignId('actor_id')->nullable()
                ->constrained('arcade_cashier_staff')->nullOnDelete();
            $table->string('event_type', 24);
            $table->json('details');
            $table->timestamp('created_at');
            $table->index(['dispute_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_coupon_dispute_events');
        Schema::dropIfExists('arcade_coupon_disputes');
        Schema::dropIfExists('arcade_coupon_delivery_receipts');
    }
};
