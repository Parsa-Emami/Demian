<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class ArcadePlayer extends Model
{
    use HasUuids;

    protected $fillable = ['display_name', 'token_hash'];
    protected $hidden = ['token_hash'];
}
