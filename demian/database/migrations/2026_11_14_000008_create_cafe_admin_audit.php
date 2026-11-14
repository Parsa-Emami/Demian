<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Staff records are preserved; role mappings are explicit in CafeAccess
        // and support the existing 16-character column.
        Schema::create('arcade_cashier_admin_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('actor_id')->nullable()
                ->constrained('arcade_cashier_staff')->restrictOnDelete();
            $table->foreignId('subject_id')->nullable()
                ->constrained('arcade_cashier_staff')->restrictOnDelete();
            $table->string('event_type', 40);
            $table->json('details');
            $table->timestamp('created_at');
            $table->index(['created_at', 'id']);
            $table->index(['subject_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_cashier_admin_events');
    }
};
