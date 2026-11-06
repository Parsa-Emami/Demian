<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_players', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('display_name', 32);
            $table->char('token_hash', 64)->unique();
            $table->timestamps();
        });
        Schema::create('arcade_runs', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('player_id')->constrained('arcade_players')->cascadeOnDelete();
            $table->uuid('request_id');
            $table->string('game_id', 40);
            $table->string('rules_version', 40);
            $table->string('character_slug', 24);
            $table->unsignedBigInteger('seed');
            $table->unsignedSmallInteger('track_width');
            $table->string('status', 16)->default('started');
            $table->unsignedInteger('score')->default(0);
            $table->unsignedInteger('ticks')->default(0);
            $table->unsignedInteger('passed')->default(0);
            $table->char('replay_hash', 64)->nullable();
            $table->timestamp('started_at');
            $table->timestamp('expires_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['player_id', 'request_id']);
            $table->index(['status', 'expires_at']);
            $table->index(['player_id', 'started_at']);
        });
        Schema::create('arcade_replays', function (Blueprint $table): void {
            $table->foreignUuid('run_id')->primary()->constrained('arcade_runs')->cascadeOnDelete();
            $table->json('transitions');
            $table->timestamp('created_at');
        });
        Schema::create('arcade_leaderboard_entries', function (Blueprint $table): void {
            $table->id();
            $table->foreignUuid('player_id')->constrained('arcade_players')->cascadeOnDelete();
            $table->foreignUuid('run_id')->constrained('arcade_runs')->cascadeOnDelete();
            $table->string('game_id', 40);
            $table->string('rules_version', 40);
            $table->string('period_key', 24);
            $table->unsignedInteger('score');
            $table->timestamp('achieved_at');
            $table->unique(['game_id', 'rules_version', 'period_key', 'player_id'], 'arcade_personal_best');
            $table->index(['game_id', 'rules_version', 'period_key', 'score', 'achieved_at'], 'arcade_ranking');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_leaderboard_entries');
        Schema::dropIfExists('arcade_replays');
        Schema::dropIfExists('arcade_runs');
        Schema::dropIfExists('arcade_players');
    }
};
