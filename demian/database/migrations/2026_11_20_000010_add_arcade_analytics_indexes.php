<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    private const INDEXES=[
        'arcade_players'=>['bi_players_created'=>['created_at']],
        'arcade_runs'=>['bi_runs_status_start'=>['status','started_at']],
        'arcade_coupons'=>['bi_coupons_issued'=>['issued_at']],
        'arcade_coupon_redemptions'=>['bi_receipts_channel_date'=>['channel','redeemed_at']],
        'arcade_referrals'=>['bi_referrals_created'=>['created_at']],
    ];

    public function up(): void
    {
        foreach(self::INDEXES as $table=>$indexes) Schema::table($table,function(Blueprint $t)use($indexes): void {
            foreach($indexes as $name=>$columns)$t->index($columns,$name);
        });
    }

    public function down(): void
    {
        foreach(self::INDEXES as $table=>$indexes) Schema::table($table,function(Blueprint $t)use($indexes): void {
            foreach(array_keys($indexes) as $name)$t->dropIndex($name);
        });
    }
};
