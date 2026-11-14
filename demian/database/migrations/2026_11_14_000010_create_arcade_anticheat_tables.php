<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Observations are short-lived, sanitized counters, never request bodies,
        // raw addresses, identity bearer tokens, or user agents.
        Schema::create('arcade_anticheat_observations', function (Blueprint $table): void {
            $table->id();
            $table->foreignUuid('player_id')->nullable()
                ->constrained('arcade_players')->cascadeOnDelete();
            $table->foreignUuid('run_id')->nullable()
                ->constrained('arcade_runs')->cascadeOnDelete();
            $table->string('event_code', 24);
            $table->char('ip_digest', 64)->nullable();
            $table->unsignedSmallInteger('http_status')->nullable();
            $table->string('game_id', 40)->nullable();
            $table->unsignedInteger('score')->nullable();
            $table->timestamp('created_at');
            $table->index(['player_id', 'event_code', 'created_at'], 'ac_player_event_time');
            $table->index(['ip_digest', 'event_code', 'created_at'], 'ac_ip_event_time');
            $table->index(['run_id', 'created_at']);
            $table->index('created_at');
        });

        Schema::create('arcade_cheat_reports', function (Blueprint $table): void {
            $table->id();
            $table->foreignUuid('player_id')->nullable()
                ->constrained('arcade_players')->cascadeOnDelete();
            $table->foreignUuid('run_id')->nullable()
                ->constrained('arcade_runs')->cascadeOnDelete();
            $table->char('fingerprint', 64)->unique();
            $table->string('signal', 48);
            $table->string('severity', 12);
            $table->unsignedSmallInteger('risk_score');
            $table->string('status', 16)->default('open');
            $table->json('evidence');
            $table->unsignedInteger('hits')->default(1);
            $table->timestamp('first_seen');
            $table->timestamp('last_seen');
            $table->foreignId('reviewed_by')->nullable()
                ->constrained('arcade_cashier_staff')->restrictOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'severity', 'created_at'], 'ac_report_queue');
            $table->index(['player_id', 'status', 'created_at'], 'ac_report_player');
            $table->index(['signal', 'created_at']);
        });

        Schema::create('arcade_cheat_review_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('report_id')->constrained('arcade_cheat_reports')
                ->cascadeOnDelete();
            $table->foreignId('actor_id')->nullable()
                ->constrained('arcade_cashier_staff')->restrictOnDelete();
            $table->string('action', 32);
            $table->string('previous_status', 16)->nullable();
            $table->string('next_status', 16)->nullable();
            $table->string('note', 500)->nullable();
            $table->timestamp('created_at');
            $table->index(['report_id', 'created_at']);
        });

        // A human-supervised, time-limited restriction on NEW run starts.
        // It does not erase a verified score or revoke a prize.
        Schema::create('arcade_anticheat_holds', function (Blueprint $table): void {
            $table->foreignUuid('player_id')->primary()
                ->constrained('arcade_players')->cascadeOnDelete();
            $table->foreignId('report_id')->constrained('arcade_cheat_reports')
                ->cascadeOnDelete();
            $table->foreignId('actor_id')->constrained('arcade_cashier_staff')
                ->restrictOnDelete();
            $table->timestamp('expires_at');
            $table->timestamps();
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_anticheat_holds');
        Schema::dropIfExists('arcade_cheat_review_events');
        Schema::dropIfExists('arcade_cheat_reports');
        Schema::dropIfExists('arcade_anticheat_observations');
    }
};
