<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('event_sessions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('event_id', 64)->index();
            $table->unsignedInteger('definition_revision')->default(1);
            $table->string('seed', 128);
            $table->string('token_hash', 64);
            $table->string('status', 24)->default('active')->index();
            $table->timestamp('started_at');
            $table->timestamp('expires_at')->index();
            $table->timestamp('completed_at')->nullable();
            $table->unsignedBigInteger('score')->default(0);
            $table->string('evidence_hash', 64)->nullable();
            $table->json('objective_payload')->nullable();
            $table->json('reward_payload')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('event_reward_claims', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('event_session_id')->unique()->constrained('event_sessions')->cascadeOnDelete();
            $table->string('event_id', 64)->index();
            $table->unsignedBigInteger('score')->default(0);
            $table->boolean('successful')->default(false)->index();
            $table->json('rewards');
            $table->string('integrity_level', 32)->default('client-evidence');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_reward_claims');
        Schema::dropIfExists('event_sessions');
    }
};
