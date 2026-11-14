<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_cashier_staff', function (Blueprint $table): void {
            $table->id();
            $table->string('username', 64)->unique();
            $table->string('display_name', 100);
            $table->string('password_hash', 255);
            $table->string('branch_id', 40);
            $table->string('role', 16)->default('cashier');
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('session_version')->default(1);
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();
            $table->index(['branch_id', 'is_active']);
        });

        // Keep the Phase 8 online transaction ledger readable; the new in-cafe
        // channel does not invent a fake online reservation or payment.
        Schema::table('arcade_coupon_redemptions', function (Blueprint $table): void {
            $table->foreignId('reservation_id')->nullable()->change();
            $table->string('channel', 16)->default('shop');
            $table->foreignId('cashier_id')->nullable()
                ->constrained('arcade_cashier_staff')->restrictOnDelete();
            $table->string('branch_id', 40)->nullable();
        });

        Schema::create('arcade_cashier_requests', function (Blueprint $table): void {
            $table->uuid('request_key')->primary();
            $table->foreignId('coupon_id')->unique()
                ->constrained('arcade_coupons')->restrictOnDelete();
            $table->foreignId('cashier_id')
                ->constrained('arcade_cashier_staff')->restrictOnDelete();
            $table->foreignId('redemption_id')->unique()
                ->constrained('arcade_coupon_redemptions')->restrictOnDelete();
            $table->char('ticket_hash', 64)->unique();
            $table->unsignedBigInteger('subtotal_minor');
            $table->timestamp('created_at');
            $table->index(['cashier_id', 'created_at']);
        });
    }

    public function down(): void
    {
        // Reverse only when no real in-cafe redemptions exist.
        Schema::dropIfExists('arcade_cashier_requests');
        Schema::table('arcade_coupon_redemptions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('cashier_id');
            $table->dropColumn(['channel', 'branch_id']);
            // Intentionally retain reservation_id nullable. Switching it back
            // would destroy valid in-cafe transaction history.
        });
        Schema::dropIfExists('arcade_cashier_staff');
    }
};
