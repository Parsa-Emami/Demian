<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arcade_cheat_appeals', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('report_id')->constrained('arcade_cheat_reports')->cascadeOnDelete();
            $table->foreignUuid('player_id')->constrained('arcade_players')->cascadeOnDelete();
            $table->string('reason_code', 32);
            // Sensitive narrative encrypted at rest; no phone, IP or token columns.
            $table->text('statement_ciphertext');
            $table->string('status', 16)->default('open');
            $table->foreignId('reviewed_by')->nullable()
                ->constrained('arcade_cashier_staff')->restrictOnDelete();
            $table->string('resolution_note', 500)->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->unique(['report_id', 'player_id'], 'ac_appeal_once_per_case');
            $table->index(['status', 'created_at'], 'ac_appeal_queue');
            $table->index(['player_id', 'created_at'], 'ac_appeal_player');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_cheat_appeals');
    }
};
