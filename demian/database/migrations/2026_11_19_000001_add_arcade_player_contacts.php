<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('arcade_players', function (Blueprint $table): void {
            $table->string('contact_type', 16)->nullable();
            $table->text('contact_value')->nullable();
            $table->char('contact_hash', 64)->nullable()->unique();
            $table->char('registration_key_hash', 64)->nullable()->unique();
        });
    }

    public function down(): void
    {
        Schema::table('arcade_players', function (Blueprint $table): void {
            $table->dropUnique(['contact_hash']);
            $table->dropUnique(['registration_key_hash']);
            $table->dropColumn(['contact_type', 'contact_value', 'contact_hash', 'registration_key_hash']);
        });
    }
};
