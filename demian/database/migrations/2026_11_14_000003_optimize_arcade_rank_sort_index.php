<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Optimize the actual leaderboard ORDER BY: score DESC,
     * achieved_at ASC, id ASC. This is an additive, non-destructive
     * index: retain the old index until production EXPLAIN confirms the
     * new plan and the old index is known to be redundant.
     */
    public function up(): void
    {
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb', 'sqlite'], true)) {
            DB::statement('CREATE INDEX arcade_rank_order_v2 ON arcade_leaderboard_entries '.
                '(game_id, rules_version, period_key, score DESC, achieved_at ASC, id ASC)');
        }
    }

    public function down(): void
    {
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb', 'sqlite'], true)) {
            if (DB::getDriverName() === 'sqlite') {
                DB::statement('DROP INDEX arcade_rank_order_v2');
            } else {
                DB::statement('DROP INDEX arcade_rank_order_v2 ON arcade_leaderboard_entries');
            }
        }
    }
};
