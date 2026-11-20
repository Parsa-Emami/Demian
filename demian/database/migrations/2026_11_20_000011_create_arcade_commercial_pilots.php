<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('arcade_pilot_lock',function(Blueprint $t): void {$t->unsignedTinyInteger('id')->primary();});
        DB::table('arcade_pilot_lock')->insert(['id'=>1]);
        Schema::create('arcade_commercial_pilots',function(Blueprint $t): void {
            $t->id();$t->string('branch_id',40);$t->string('mode',12);
            $t->string('status',16)->default('draft');
            $t->date('baseline_start');$t->date('pilot_start');$t->unsignedTinyInteger('days');
            $t->char('currency',3);$t->unsignedBigInteger('discount_budget_minor');
            $t->unsignedSmallInteger('minimum_receipts');$t->unsignedSmallInteger('target_uplift_bps');
            $t->char('release_sha',40)->nullable();$t->char('art_sha',64)->nullable();
            $t->unsignedBigInteger('started_at_epoch')->nullable();
            $t->unsignedBigInteger('stopped_at_epoch')->nullable();
            $t->string('decision',20)->nullable();
            $t->foreignId('created_by')->constrained('arcade_cashier_staff')->restrictOnDelete();
            $t->timestamps();$t->index(['branch_id','status']);
        });
        Schema::create('arcade_pilot_daily',function(Blueprint $t): void {
            $t->id();$t->foreignId('pilot_id')->constrained('arcade_commercial_pilots')->restrictOnDelete();
            $t->date('day');$t->string('period',12);$t->unsignedInteger('receipts');
            $t->unsignedBigInteger('net_sales_minor');$t->unsignedBigInteger('variable_cost_minor');
            $t->unsignedBigInteger('operating_cost_minor');$t->unsignedInteger('coupon_receipts');
            $t->unsignedBigInteger('coupon_discount_minor');$t->unsignedBigInteger('coupon_net_minor');$t->unsignedInteger('qr_launches');
            $t->unsignedSmallInteger('saturated_table_days');$t->unsignedSmallInteger('incidents');
            $t->string('evidence_ref',80);$t->foreignId('actor_id')->constrained('arcade_cashier_staff')->restrictOnDelete();
            $t->timestamp('created_at');$t->unique(['pilot_id','day']);
        });
        Schema::create('arcade_pilot_events',function(Blueprint $t): void {
            $t->id();$t->foreignId('pilot_id')->constrained('arcade_commercial_pilots')->restrictOnDelete();
            $t->foreignId('actor_id')->constrained('arcade_cashier_staff')->restrictOnDelete();
            $t->string('event_type',24);$t->string('evidence_ref',80);
            $t->json('details');$t->timestamp('created_at');
            $t->index(['pilot_id','id']);
        });
        Schema::create('arcade_pilot_actions',function(Blueprint $t): void {
            $t->id();$t->foreignId('pilot_id')->constrained('arcade_commercial_pilots')->restrictOnDelete();
            $t->string('category',24);$t->string('success_metric',40);$t->date('due_day');
            $t->string('evidence_ref',80);$t->string('status',16)->default('open');
            $t->foreignId('owner_id')->constrained('arcade_cashier_staff')->restrictOnDelete();
            $t->timestamps();$t->index(['pilot_id','status']);
        });
    }

    public function down(): void
    {
        foreach(['arcade_pilot_actions','arcade_pilot_events','arcade_pilot_daily','arcade_commercial_pilots','arcade_pilot_lock'] as $table)
            Schema::dropIfExists($table);
    }
};
