<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Gift attribution is separate from the sealed weekly winner ledger.
        // Do not manufacture ranks or modify Phase 7b results.
        Schema::create('arcade_coupon_gifts', function (Blueprint $table): void {
            $table->id();
            $table->uuid('request_key')->unique();
            $table->char('request_digest', 64);
            $table->foreignId('issuer_id')
                ->constrained('arcade_cashier_staff')->restrictOnDelete();
            $table->foreignUuid('player_id')->nullable()
                ->constrained('arcade_players')->nullOnDelete();
            $table->string('reason', 24);
            $table->string('reason_note', 200)->nullable();
            $table->timestamp('created_at');
            $table->index(['issuer_id', 'created_at']);
            $table->index(['player_id', 'created_at']);
        });

        Schema::table('arcade_coupons', function (Blueprint $table): void {
            $table->foreignId('winner_id')->nullable()->change();
            $table->string('source', 16)->default('weekly')->index();
            $table->foreignId('gift_id')->nullable()->unique()
                ->constrained('arcade_coupon_gifts')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        // Intentionally non-destructive. Requiring winner_id again would
        // orphan issued gifts or force irreversible financial data deletion.
        // Reverse via a reviewed, data-preserving migration if ever needed.
    }
};
