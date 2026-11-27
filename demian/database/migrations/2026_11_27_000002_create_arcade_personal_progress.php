<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_personal_progress', function (Blueprint $t): void {
            $t->id();
            $t->string('period_key', 24);
            $t->foreign('period_key')->references('period_key')->on('arcade_weekly_periods')->restrictOnDelete();
            $t->foreignUuid('player_id')->constrained('arcade_players')->cascadeOnDelete();
            $t->foreignUuid('run_id')->nullable()->constrained('arcade_runs')->nullOnDelete();
            $t->string('game_id', 40);
            $t->string('rules_version', 40);
            $t->string('policy_version', 40);
            $t->unsignedInteger('score');
            $t->unsignedInteger('previous_best')->nullable();
            $t->unsignedInteger('previous_weeks');
            $t->unsignedInteger('target_score')->nullable();
            $t->boolean('personal_record');
            $t->string('badge', 32)->nullable();
            $t->string('status', 24);
            $t->char('source_sha256', 64);
            $t->timestamp('achieved_at');
            $t->timestamp('created_at');
            $t->unique(['period_key', 'player_id', 'game_id'], 'progress_one_game_week');
            $t->index(['player_id', 'game_id', 'rules_version', 'period_key'], 'progress_personal_history');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_personal_progress');
    }
};
