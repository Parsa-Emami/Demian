<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_weekly_award_coordinator', function (Blueprint $table): void {
            $table->unsignedTinyInteger('id')->primary();
            $table->timestamp('created_at');
        });

        DB::table('arcade_weekly_award_coordinator')->insert([
            'id' => 1, 'created_at' => now(),
        ]);

        Schema::create('arcade_weekly_award_finalizations', function (Blueprint $table): void {
            $table->string('period_key', 24)->primary();
            $table->foreign('period_key')->references('period_key')
                ->on('arcade_weekly_periods')->restrictOnDelete();
            $table->char('snapshot_hash', 64);
            $table->unsignedInteger('winner_count');
            $table->unsignedInteger('coupon_count');
            $table->foreignId('campaign_id')->nullable()
                ->constrained('arcade_reward_campaigns')->restrictOnDelete();
            $table->timestamp('finalized_at');
            $table->index(['finalized_at', 'period_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_weekly_award_finalizations');
        Schema::dropIfExists('arcade_weekly_award_coordinator');
    }
};
