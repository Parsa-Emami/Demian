<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EventRewardClaim extends Model
{
    use HasUuids;

    protected $fillable = ['event_session_id', 'event_id', 'score', 'successful', 'rewards', 'integrity_level'];

    protected function casts(): array
    {
        return [
            'score' => 'integer',
            'successful' => 'boolean',
            'rewards' => 'array',
        ];
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(EventSession::class, 'event_session_id');
    }
}
