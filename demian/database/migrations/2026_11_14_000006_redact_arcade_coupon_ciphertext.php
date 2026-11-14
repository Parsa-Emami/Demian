<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Account erasure/revocation must destroy recoverable encrypted secrets,
 * including historical redeemed coupons, without deleting redemption audit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('arcade_coupons', function (Blueprint $table): void {
            $table->text('code_ciphertext')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Restoring NOT NULL would fabricate erased secrets. Irreversible
        // privacy-safe migration: intentionally no destructive rollback.
    }
};
