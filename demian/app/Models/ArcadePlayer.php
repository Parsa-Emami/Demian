<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class ArcadePlayer extends Model
{
    use HasUuids;

    protected $fillable = ['display_name', 'token_hash', 'recovery_hash', 'token_expires_at', 'recovery_expires_at', 'backup_hash', 'backup_expires_at', 'legal_policy_version', 'legal_accepted_at',
        'contact_type', 'contact_value', 'contact_hash', 'registration_key_hash', 'phone_verified_at'];
    protected function casts(): array
    {
        return ['token_expires_at' => 'datetime', 'recovery_expires_at' => 'datetime', 'backup_expires_at' => 'datetime', 'legal_accepted_at' => 'datetime', 'phone_verified_at' => 'datetime', 'contact_value' => 'encrypted'];
    }

    protected $hidden = ['token_hash', 'recovery_hash', 'backup_hash', 'contact_value', 'contact_hash', 'registration_key_hash'];
}
