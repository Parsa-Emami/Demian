<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_push_subscriptions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('player_id')->constrained('arcade_players')->cascadeOnDelete();
            $table->char('endpoint_hash', 64)->unique();
            $table->char('key_id', 64)->index();
            $table->text('ciphertext');
            $table->timestamps();
        });
        Schema::create('arcade_push_notices', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('actor_id')->nullable()->constrained('arcade_cashier_staff')->nullOnDelete();
            $table->foreignUuid('player_id')->nullable()->constrained('arcade_players')->cascadeOnDelete();
            $table->string('title', 80);
            $table->string('body', 220);
            $table->string('target', 20);
            $table->unsignedInteger('recipients')->default(0);
            $table->unsignedInteger('accepted')->default(0);
            $table->timestamp('expires_at')->index();
            $table->timestamp('created_at');
        });
        Schema::create('arcade_push_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignUuid('notice_id')->constrained('arcade_push_notices')->cascadeOnDelete();
            $table->foreignUuid('subscription_id')->constrained('arcade_push_subscriptions')->cascadeOnDelete();
            $table->string('status', 12);
            $table->unsignedTinyInteger('attempts');
            $table->timestamp('next_attempt_at');
            $table->unique(['notice_id', 'subscription_id'], 'push_notice_recipient');
            $table->index(['status', 'next_attempt_at', 'id'], 'push_due');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_push_deliveries');
        Schema::dropIfExists('arcade_push_notices');
        Schema::dropIfExists('arcade_push_subscriptions');
    }
};
