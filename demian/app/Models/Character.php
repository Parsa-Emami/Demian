<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Character extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'sprite_sheet_path',
        'atlas_path',
        'is_builtin',
        'is_active',
        'settings',
    ];

    protected function casts(): array
    {
        return [
            'is_builtin' => 'boolean',
            'is_active' => 'boolean',
            'settings' => 'array',
        ];
    }

    public function spriteUrl(): string
    {
        return $this->is_builtin
            ? asset($this->sprite_sheet_path)
            : Storage::disk('public')->url($this->sprite_sheet_path);
    }

    public function atlasUrl(): string
    {
        return $this->is_builtin
            ? asset($this->atlas_path)
            : Storage::disk('public')->url($this->atlas_path);
    }

    public function toStudioArray(): array
    {
        return [
            'id' => $this->getKey(),
            'name' => $this->name,
            'slug' => $this->slug,
            'sprite_url' => $this->spriteUrl(),
            'atlas_url' => $this->atlasUrl(),
            'is_builtin' => $this->is_builtin,
            'is_active' => $this->is_active,
            'settings' => $this->settings ?? [],
            'created_at' => optional($this->created_at)->toISOString(),
            'updated_at' => optional($this->updated_at)->toISOString(),
        ];
    }
}
