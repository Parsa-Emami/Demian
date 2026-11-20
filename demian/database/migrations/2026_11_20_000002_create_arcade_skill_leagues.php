<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('arcade_skill_seasons', function (Blueprint $t): void {
            $t->string('period_key', 24)->primary();
            $t->foreign('period_key')->references('period_key')->on('arcade_weekly_periods')->restrictOnDelete();
            $t->string('policy_version', 40);
            $t->char('source_sha256', 64);
            $t->char('snapshot_sha256', 64);
            $t->unsignedInteger('participants');
            $t->unsignedInteger('qualified');
            $t->timestamp('finalized_at')->index();
        });
        Schema::create('arcade_skill_standings', function (Blueprint $t): void {
            $t->id();
            $t->string('period_key', 24);
            $t->foreign('period_key')->references('period_key')->on('arcade_skill_seasons')->restrictOnDelete();
            $t->foreignUuid('player_id')->nullable()->constrained('arcade_players')->nullOnDelete();
            $t->foreignUuid('run_id')->nullable()->constrained('arcade_runs')->nullOnDelete();
            $t->string('source_game_id', 40);
            $t->unsignedSmallInteger('points');
            $t->unsignedInteger('cohort_size');
            $t->boolean('qualified');
            $t->string('league', 12);
            $t->unsignedTinyInteger('peak_tier')->default(0);
            $t->unsignedTinyInteger('low_weeks')->default(0);
            $t->string('movement', 16);
            $t->unsignedInteger('rank');
            $t->unsignedInteger('position');
            $t->timestamp('achieved_at');
            $t->unique(['period_key','player_id'], 'skill_one_player_week');
            $t->unique(['period_key','league','position'], 'skill_one_position');
            $t->index(['player_id','period_key','qualified'], 'skill_player_history');
            $t->index(['period_key','league','position'], 'skill_public_order');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_skill_standings');
        Schema::dropIfExists('arcade_skill_seasons');
    }
};
