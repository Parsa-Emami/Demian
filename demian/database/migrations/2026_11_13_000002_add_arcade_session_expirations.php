<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('arcade_players', function (Blueprint $table): void {
            $table->timestamp('token_expires_at')->nullable()->index();
            $table->timestamp('recovery_expires_at')->nullable();
            $table->char('backup_hash', 64)->nullable()->unique();
            $table->timestamp('backup_expires_at')->nullable();
        });

        // Migration policy: existing bearer tokens get a bounded 30-day
        // transition window; previously indefinite recovery links are revoked.
        DB::table('arcade_players')->whereNull('token_expires_at')
            ->update(['token_expires_at' => now()->addDays(30)]);
        DB::table('arcade_players')->whereNotNull('recovery_hash')
            ->update(['recovery_hash' => null, 'recovery_expires_at' => null]);
    }

    public function down(): void
    {
        Schema::table('arcade_players', function (Blueprint $table): void {
            $table->dropIndex(['token_expires_at']);
            $table->dropUnique(['backup_hash']);
            $table->dropColumn(['token_expires_at', 'recovery_expires_at', 'backup_hash', 'backup_expires_at']);
        });
    }
};
