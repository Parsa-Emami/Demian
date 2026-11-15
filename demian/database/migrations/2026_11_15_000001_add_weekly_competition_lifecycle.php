<?php

use Carbon\CarbonImmutable;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 Step 11: additive lifecycle and per-game immutable weekly rule locks.
 *
 * Keep old 'open' / 'sealed' in status for coupon-ledger compatibility;
 * lifecycle_status is canonical scheduled/active/closing/finalized.
 * Historic settlements, results, winners and replays are not rewritten.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('arcade_weekly_periods', function (Blueprint $table): void {
            $table->string('lifecycle_status', 16)->default('active');
            $table->unsignedSmallInteger('start_cutoff_seconds')->default(30);
            $table->timestamp('completion_deadline_at')->nullable();
        });
        Schema::create('arcade_weekly_rule_locks', function (Blueprint $table): void {
            $table->string('period_key', 24);
            $table->string('game_id', 40);
            $table->string('rules_version', 40);
            $table->timestamp('locked_at');
            $table->primary(['period_key', 'game_id'], 'weekly_game_rule_lock');
            $table->foreign('period_key')->references('period_key')
                ->on('arcade_weekly_periods')->restrictOnDelete();
        });
        Schema::create('arcade_weekly_lifecycle_events', function (Blueprint $table): void {
            $table->id();
            $table->string('period_key', 24);
            $table->foreign('period_key')->references('period_key')
                ->on('arcade_weekly_periods')->restrictOnDelete();
            $table->string('state', 16);
            $table->timestamp('effective_at');
            $table->timestamp('recorded_at');
            $table->unique(['period_key', 'state'], 'weekly_lifecycle_once');
            $table->index(['period_key', 'effective_at']);
        });

        // Preserve all historical week rows including already sealed periods.
        DB::table('arcade_weekly_periods')->orderBy('period_key')
            ->chunk(100, function ($periods): void {
                foreach ($periods as $period) {
                    $start = CarbonImmutable::parse($period->starts_at, 'UTC');
                    $end = CarbonImmutable::parse($period->ends_at, 'UTC');
                    $now = CarbonImmutable::now('UTC');
                    $state = $period->status === 'sealed' ? 'finalized'
                        : ($now->lt($start) ? 'scheduled'
                            : ($now->lt($end) ? 'active' : 'closing'));
                    DB::table('arcade_weekly_periods')
                        ->where('period_key', $period->period_key)->update([
                            'lifecycle_status' => $state,
                            'start_cutoff_seconds' => max(0, min(3600,
                                (int) config('demian-arcade.weekly_start_cutoff_seconds', 30))),
                            'completion_deadline_at' => $end->addSeconds(
                                max(60, (int) config('demian-arcade.weekly_completion_deadline_seconds', 900))
                            )->toDateTimeString(),
                        ]);
                    DB::table('arcade_weekly_lifecycle_events')->insertOrIgnore([
                        'period_key' => $period->period_key,
                        'state' => $state,
                        'effective_at' => ($state === 'finalized'
                            ? CarbonImmutable::parse($period->sealed_at ?? $period->ends_at, 'UTC')
                            : ($state === 'scheduled' ? $now
                                : ($state === 'active' ? $start : $end)))->toDateTimeString(),
                        'recorded_at' => $now->toDateTimeString(),
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_weekly_lifecycle_events');
        Schema::dropIfExists('arcade_weekly_rule_locks');
        Schema::table('arcade_weekly_periods', function (Blueprint $table): void {
            $table->dropColumn(['lifecycle_status', 'completion_deadline_at',
                'start_cutoff_seconds']);
        });
    }
};
