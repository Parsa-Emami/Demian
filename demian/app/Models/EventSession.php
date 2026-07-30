<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

class EventSession extends Model
{
    use HasUuids;

    protected $hidden = ['token_hash'];

    protected $fillable = [
        'event_id', 'definition_revision', 'seed', 'token_hash', 'status',
        'started_at', 'expires_at', 'completed_at', 'score', 'evidence_hash',
        'objective_payload', 'reward_payload', 'metadata',
    ];

    protected function casts(): array
    {
        return [
            'definition_revision' => 'integer',
            'started_at' => 'immutable_datetime',
            'expires_at' => 'immutable_datetime',
            'completed_at' => 'immutable_datetime',
            'score' => 'integer',
            'objective_payload' => 'array',
            'reward_payload' => 'array',
            'metadata' => 'array',
        ];
    }

    public function rewardClaim(): HasOne
    {
        return $this->hasOne(EventRewardClaim::class);
    }
}
