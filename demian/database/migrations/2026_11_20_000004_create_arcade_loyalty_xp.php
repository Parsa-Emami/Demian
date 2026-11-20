<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('arcade_loyalty_xp', function (Blueprint $t): void {
            $t->id();
            $t->string('period_key',24);
            $t->foreign('period_key')->references('period_key')->on('arcade_weekly_periods')->restrictOnDelete();
            $t->foreignUuid('player_id')->constrained('arcade_players')->cascadeOnDelete();
            $t->string('policy_version',40);
            $t->unsignedTinyInteger('distinct_games');
            $t->unsignedSmallInteger('participation_xp');
            $t->unsignedSmallInteger('variety_xp');
            $t->unsignedSmallInteger('progress_xp');
            $t->unsignedSmallInteger('continuity_xp');
            $t->unsignedSmallInteger('total_xp');
            $t->boolean('late_seal');
            $t->char('source_sha256',64);
            $t->timestamp('created_at');
            $t->unique(['player_id','period_key'],'loyalty_one_grant_per_week');
            $t->index('period_key');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_loyalty_xp');
    }
};
