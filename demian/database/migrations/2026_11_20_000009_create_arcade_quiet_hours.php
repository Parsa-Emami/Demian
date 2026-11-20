<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('arcade_quiet_hours_lock',function(Blueprint $t): void {
            $t->unsignedTinyInteger('id')->primary();
        });
        DB::table('arcade_quiet_hours_lock')->insert(['id'=>1]);
        Schema::create('arcade_quiet_offers',function(Blueprint $t): void {
            $t->id();
            $t->string('branch_id',40);
            $t->date('local_day')->index();
            $t->timestamp('starts_at');
            $t->timestamp('ends_at');
            $t->timestamp('observed_at');
            $t->unsignedSmallInteger('occupied_seats');
            $t->unsignedSmallInteger('total_seats');
            $t->unsignedTinyInteger('percent');
            $t->char('currency',3);
            $t->string('policy_version',40);
            $t->unsignedBigInteger('min_order_minor');
            $t->unsignedBigInteger('max_discount_minor');
            $t->unsignedSmallInteger('capacity');
            $t->unsignedSmallInteger('cost_ceiling_bps');
            $t->unsignedSmallInteger('margin_floor_bps');
            $t->boolean('paused')->default(false);
            $t->foreignId('created_by')->constrained('arcade_cashier_staff')->restrictOnDelete();
            $t->timestamps();
            $t->index(['branch_id','starts_at','ends_at'],'quiet_branch_window');
        });
        Schema::create('arcade_quiet_claims',function(Blueprint $t): void {
            $t->id();
            $t->foreignId('offer_id')->constrained('arcade_quiet_offers')->restrictOnDelete();
            $t->foreignId('coupon_id')->unique()->constrained('arcade_coupons')->restrictOnDelete();
            $t->foreignUuid('player_id')->nullable()->constrained('arcade_players')->nullOnDelete();
            $t->date('local_day');
            $t->char('identity_digest',64)->nullable();
            $t->timestamp('created_at');
            $t->unique(['local_day','identity_digest'],'quiet_identity_day');
            $t->unique(['local_day','player_id'],'quiet_player_day');
            $t->index('offer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_quiet_claims');
        Schema::dropIfExists('arcade_quiet_offers');
        Schema::dropIfExists('arcade_quiet_hours_lock');
    }
};
