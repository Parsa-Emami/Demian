<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('arcade_players', function (Blueprint $table): void {
            // A one-time recovery capability, not a phone or social identity.
            // Only SHA-256 is persisted; the 64-character secret is shown once.
            $table->char('recovery_hash', 64)->nullable()->unique();
        });
    }

    public function down(): void
    {
        Schema::table('arcade_players', function (Blueprint $table): void {
            $table->dropUnique(['recovery_hash']);
            $table->dropColumn('recovery_hash');
        });
    }
};
