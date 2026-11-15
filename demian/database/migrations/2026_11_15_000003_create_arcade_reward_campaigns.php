<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_reward_campaigns', function (Blueprint $table): void {
            $table->id();
            $table->string('period_key', 24)->unique();
            $table->foreign('period_key')->references('period_key')
                ->on('arcade_weekly_periods')->restrictOnDelete();
            $table->string('title', 100);
            $table->string('status', 16)->default('draft');
            $table->unsignedSmallInteger('max_awards');
            $table->json('terms');
            $table->char('terms_hash', 64);
            $table->foreignId('created_by')->constrained('arcade_cashier_staff')->restrictOnDelete();
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'id']);
        });

        Schema::create('arcade_reward_import_batches', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('campaign_id')->constrained('arcade_reward_campaigns')->restrictOnDelete();
            $table->uuid('request_key')->unique();
            $table->char('request_digest', 64);
            $table->unsignedSmallInteger('code_count');
            $table->foreignId('actor_id')->constrained('arcade_cashier_staff')->restrictOnDelete();
            $table->timestamp('created_at');
        });

        Schema::create('arcade_reward_inventory', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('campaign_id')->constrained('arcade_reward_campaigns')->restrictOnDelete();
            $table->foreignId('batch_id')->constrained('arcade_reward_import_batches')->restrictOnDelete();
            $table->char('code_hash', 64)->unique();
            $table->text('code_ciphertext')->nullable();
            $table->string('status', 16)->default('available');
            $table->foreignId('coupon_id')->nullable()->unique()
                ->constrained('arcade_coupons')->restrictOnDelete();
            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('voided_at')->nullable();
            $table->timestamps();
            $table->index(['campaign_id', 'status', 'id'], 'arcade_reward_available_index');
        });

        Schema::table('arcade_coupons', function (Blueprint $table): void {
            $table->foreignId('campaign_id')->nullable()->index()
                ->constrained('arcade_reward_campaigns')->restrictOnDelete();
        });

        Schema::create('arcade_reward_campaign_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('campaign_id')->constrained('arcade_reward_campaigns')->restrictOnDelete();
            $table->foreignId('actor_id')->nullable()
                ->constrained('arcade_cashier_staff')->restrictOnDelete();
            $table->string('event_type', 32);
            $table->json('details');
            $table->timestamp('created_at');
            $table->index(['campaign_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_reward_campaign_events');
        Schema::table('arcade_coupons', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('campaign_id');
        });
        Schema::dropIfExists('arcade_reward_inventory');
        Schema::dropIfExists('arcade_reward_import_batches');
        Schema::dropIfExists('arcade_reward_campaigns');
    }
};
