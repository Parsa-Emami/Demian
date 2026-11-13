<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class ArcadePlayer extends Model
{
    use HasUuids;

    protected $fillable = ['display_name', 'token_hash', 'recovery_hash', 'token_expires_at', 'recovery_expires_at'];
    protected function casts(): array
    {
        return ['token_expires_at' => 'datetime', 'recovery_expires_at' => 'datetime'];
    }

    protected $hidden = ['token_hash', 'recovery_hash'];
}
