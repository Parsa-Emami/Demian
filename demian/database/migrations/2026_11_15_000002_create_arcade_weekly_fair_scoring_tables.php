<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 Step 12. Parallel, non-financial fair-scoring snapshots.
 * Existing technical rankings, winners, period hashes and coupons are left
 * untouched. Season-specific policy is frozen when the period is prepared.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_weekly_fair_policies', function (Blueprint $table): void {
            $table->string('period_key', 24)->primary();
            $table->foreign('period_key')->references('period_key')
                ->on('arcade_weekly_periods')->restrictOnDelete();
            $table->string('algorithm_version', 48);
            $table->unsignedSmallInteger('maximum_points');
            $table->unsignedSmallInteger('minimum_cohort');
            $table->char('source_snapshot_hash', 64)->nullable();
            $table->char('fair_snapshot_hash', 64)->nullable();
            $table->unsignedInteger('result_count')->default(0);
            $table->unsignedInteger('qualified_count')->default(0);
            $table->timestamp('finalized_at')->nullable();
            $table->timestamps();
        });

        Schema::create('arcade_weekly_fair_game_scores', function (Blueprint $table): void {
            $table->id();
            $table->string('period_key', 24);
            $table->foreign('period_key')->references('period_key')
                ->on('arcade_weekly_periods')->restrictOnDelete();
            $table->string('game_id', 40);
            $table->string('rules_version', 40);
            $table->foreignUuid('player_id')->nullable()
                ->constrained('arcade_players')->nullOnDelete();
            $table->foreignUuid('run_id')->nullable()
                ->constrained('arcade_runs')->nullOnDelete();
            $table->unsignedInteger('raw_score');
            $table->unsignedSmallInteger('competition_points');
            $table->unsignedInteger('cohort_size');
            $table->unsignedInteger('game_rank');
            $table->unsignedInteger('position');
            $table->boolean('qualified');
            $table->timestamp('achieved_at');
            $table->timestamp('created_at');
            $table->unique(['period_key', 'game_id', 'player_id'], 'fair_one_game_best');
            $table->unique(['period_key', 'game_id', 'position'], 'fair_game_order');
            $table->index(['period_key', 'game_id', 'competition_points'], 'fair_game_scores');
        });

        Schema::create('arcade_weekly_fair_standings', function (Blueprint $table): void {
            $table->id();
            $table->string('period_key', 24);
            $table->foreign('period_key')->references('period_key')
                ->on('arcade_weekly_periods')->restrictOnDelete();
            $table->foreignUuid('player_id')->nullable()
                ->constrained('arcade_players')->nullOnDelete();
            $table->foreignUuid('run_id')->nullable()
                ->constrained('arcade_runs')->nullOnDelete();
            $table->string('source_game_id', 40);
            $table->string('rules_version', 40);
            $table->unsignedInteger('raw_score');
            $table->unsignedSmallInteger('competition_points');
            $table->unsignedInteger('cohort_size');
            $table->boolean('qualified');
            $table->unsignedInteger('competition_rank');
            $table->unsignedInteger('position');
            $table->timestamp('achieved_at');
            $table->timestamp('created_at');
            $table->unique(['period_key', 'player_id'], 'fair_one_player_week');
            $table->unique(['period_key', 'position'], 'fair_global_order');
            $table->index(['period_key', 'qualified', 'competition_points'], 'fair_public_sort');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_weekly_fair_standings');
        Schema::dropIfExists('arcade_weekly_fair_game_scores');
        Schema::dropIfExists('arcade_weekly_fair_policies');
    }
};
