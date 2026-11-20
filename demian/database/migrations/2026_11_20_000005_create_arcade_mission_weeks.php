<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('arcade_mission_weeks',function(Blueprint $t): void {
            $t->id();
            $t->string('period_key',24);
            $t->foreign('period_key')->references('period_key')->on('arcade_weekly_periods')->restrictOnDelete();
            $t->foreignUuid('player_id')->constrained('arcade_players')->cascadeOnDelete();
            $t->string('policy_version',40);
            $t->unsignedTinyInteger('day_mask');
            $t->unsignedTinyInteger('active_days');
            $t->unsignedTinyInteger('distinct_games');
            $t->unsignedTinyInteger('daily_xp');
            $t->unsignedTinyInteger('consistency_xp');
            $t->unsignedTinyInteger('variety_xp');
            $t->unsignedTinyInteger('adaptive_xp');
            $t->unsignedTinyInteger('total_xp');
            $t->string('adaptive_game_id',40)->nullable();
            $t->string('adaptive_rules_version',40)->nullable();
            $t->unsignedInteger('adaptive_target')->nullable();
            $t->char('source_sha256',64);
            $t->timestamp('created_at');
            $t->unique(['player_id','period_key'],'mission_one_week_per_player');
            $t->index('period_key');
        });
        Schema::table('arcade_runs',function(Blueprint $t): void {
            $t->index(['player_id','status','started_at'],'arcade_mission_run_window');
        });
    }
    public function down(): void
    {
        Schema::table('arcade_runs',fn(Blueprint $t)=>$t->dropIndex('arcade_mission_run_window'));
        Schema::dropIfExists('arcade_mission_weeks');
    }
};
