<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_weekly_periods', function (Blueprint $table): void {
            $table->string('period_key', 24)->primary();
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->string('status', 16)->default('open');
            $table->timestamp('sealed_at')->nullable();
            $table->unsignedInteger('participants')->default(0);
            $table->unsignedInteger('winner_count')->default(0);
            $table->char('snapshot_hash', 64)->nullable();
            $table->timestamps();
            $table->index(['status', 'ends_at']);
        });

        Schema::create('arcade_weekly_results', function (Blueprint $table): void {
            $table->id();
            $table->string('period_key', 24);
            $table->foreign('period_key')->references('period_key')->on('arcade_weekly_periods')->restrictOnDelete();
            $table->string('game_id', 40);
            $table->string('rules_version', 40);
            $table->foreignUuid('player_id')->nullable()->constrained('arcade_players')->nullOnDelete();
            $table->foreignUuid('run_id')->nullable()->constrained('arcade_runs')->nullOnDelete();
            $table->unsignedInteger('score');
            $table->timestamp('achieved_at');
            $table->unsignedInteger('technical_rank');
            $table->timestamp('created_at');
            $table->unique(['period_key', 'game_id', 'technical_rank'], 'arcade_weekly_technical_order');
            $table->unique(['period_key', 'game_id', 'player_id'], 'arcade_weekly_player_game');
        });

        Schema::create('arcade_weekly_winners', function (Blueprint $table): void {
            $table->id();
            $table->string('period_key', 24);
            $table->foreign('period_key')->references('period_key')->on('arcade_weekly_periods')->restrictOnDelete();
            $table->string('game_id', 40);
            $table->string('rules_version', 40);
            $table->foreignUuid('player_id')->nullable()->constrained('arcade_players')->nullOnDelete();
            $table->foreignUuid('run_id')->nullable()->constrained('arcade_runs')->nullOnDelete();
            $table->unsignedInteger('score');
            $table->timestamp('achieved_at');
            $table->unsignedInteger('technical_rank');
            $table->unsignedTinyInteger('prize_rank');
            $table->boolean('previous_winner');
            $table->timestamp('created_at');
            $table->unique(['period_key', 'game_id', 'prize_rank'], 'arcade_weekly_prize_rank');
            $table->unique(['period_key', 'player_id'], 'arcade_one_weekly_prize_per_player');
        });

        Schema::create('arcade_weekly_settlement_events', function (Blueprint $table): void {
            $table->id();
            $table->string('period_key', 24);
            $table->foreign('period_key')->references('period_key')->on('arcade_weekly_periods')->restrictOnDelete();
            $table->string('event_type', 32);
            $table->json('details');
            $table->timestamp('created_at');
            $table->index(['period_key', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_weekly_settlement_events');
        Schema::dropIfExists('arcade_weekly_winners');
        Schema::dropIfExists('arcade_weekly_results');
        Schema::dropIfExists('arcade_weekly_periods');
    }
};
