<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('arcade_players', function (Blueprint $table): void {
            // Never invent consent for accounts created under older policies.
            $table->string('legal_policy_version', 40)->nullable();
            $table->timestamp('legal_accepted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('arcade_players', function (Blueprint $table): void {
            $table->dropColumn(['legal_policy_version', 'legal_accepted_at']);
        });
    }
};
