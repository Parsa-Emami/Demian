<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('arcade_players', function (Blueprint $table): void {
            $table->timestamp('phone_verified_at')->nullable()->index();
        });
        // One in-flight challenge per player; DB locking serializes issue and
        // verify across PHP workers. No plaintext OTP or IP is stored.
        Schema::create('arcade_player_phone_challenges', function (Blueprint $table): void {
            $table->foreignUuid('player_id')->primary()
                ->constrained('arcade_players')->cascadeOnDelete();
            $table->char('contact_hash', 64);
            $table->char('code_hash', 64);
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->unsignedTinyInteger('sent_in_window')->default(1);
            $table->timestamp('window_started_at');
            $table->timestamp('sent_at');
            $table->timestamp('expires_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_player_phone_challenges');
        Schema::table('arcade_players', function (Blueprint $table): void {
            $table->dropIndex(['phone_verified_at']);
            $table->dropColumn('phone_verified_at');
        });
    }
};
