<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('arcade_table_inventory_lock',function(Blueprint $t): void {
            $t->unsignedTinyInteger('id')->primary();
        });
        \Illuminate\Support\Facades\DB::table('arcade_table_inventory_lock')->insert(['id'=>1]);
        Schema::create('arcade_cafe_tables',function(Blueprint $t): void {
            $t->id();
            $t->string('branch_id',40);
            $t->string('label',40);
            $t->char('code',32)->unique();
            $t->boolean('active')->default(true);
            $t->timestamps();
            $t->unique(['branch_id','label'],'cafe_table_branch_label');
        });
        Schema::create('arcade_table_daily_launches',function(Blueprint $t): void {
            $t->foreignId('table_id')->constrained('arcade_cafe_tables')->restrictOnDelete();
            $t->date('day');
            $t->unsignedInteger('launches');
            $t->primary(['table_id','day']);
            $t->index('day');
        });
        Schema::create('arcade_table_launch_nonces',function(Blueprint $t): void {
            $t->char('nonce_hash',64)->primary();
            $t->timestamp('expires_at')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arcade_table_launch_nonces');
        Schema::dropIfExists('arcade_table_daily_launches');
        Schema::dropIfExists('arcade_cafe_tables');
        Schema::dropIfExists('arcade_table_inventory_lock');
    }
};
