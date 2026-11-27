<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_referral_lock', function (Blueprint $t): void {
            $t->unsignedInteger('id')->primary();
        });
        DB::table('arcade_referral_lock')->insert(['id' => 1]);
        Schema::create('arcade_referral_codes', function (Blueprint $t): void {
            $t->foreignUuid('player_id')->primary()->constrained('arcade_players')->cascadeOnDelete();
            $t->char('code', 16)->unique();
            $t->timestamp('created_at');
        });
        Schema::create('arcade_referrals', function (Blueprint $t): void {
            $t->id();
            $t->foreignUuid('player_id')->unique()->constrained('arcade_players')->cascadeOnDelete();
            $t->foreignUuid('inviter_id')->nullable()->constrained('arcade_players')->nullOnDelete();
            $t->string('status', 16)->default('pending');
            $t->unsignedSmallInteger('points')->default(0);
            $t->timestamp('created_at');
            $t->timestamp('expires_at');
            $t->timestamp('checked_at')->nullable();
            $t->timestamp('qualified_at')->nullable();
            $t->index(['status', 'checked_at', 'id']);
            $t->index(['inviter_id', 'status']);
        });
        Schema::create('arcade_referral_costs', function (Blueprint $t): void {
            $t->string('month', 7)->primary();
            $t->unsignedBigInteger('spend_irr');
            $t->timestamp('updated_at');
        });
        Schema::create('arcade_referral_awards', function (Blueprint $t): void {
            $t->id();
            $t->char('invitee_digest', 64)->unique();
            $t->char('inviter_digest', 64);
            $t->string('month', 7)->index();
            $t->unsignedSmallInteger('points');
            $t->timestamp('expires_at')->index();
            $t->index(['month', 'inviter_digest']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_referral_awards');
        Schema::dropIfExists('arcade_referral_costs');
        Schema::dropIfExists('arcade_referrals');
        Schema::dropIfExists('arcade_referral_codes');
        Schema::dropIfExists('arcade_referral_lock');
    }
};
