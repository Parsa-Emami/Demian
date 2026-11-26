<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('arcade_players', function (Blueprint $table): void {
            $table->string('password_hash', 255)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('arcade_players', function (Blueprint $table): void {
            $table->dropColumn('password_hash');
        });
    }
};
