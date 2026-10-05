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

    private function bundledPath(string $kind): ?string
    {
        if (!$this->is_builtin) return null;
        $entry = (new \App\Services\Characters\CharacterIdentityService())->characterEntry((string) $this->slug);
        if ($entry === null) return null;
        $slug = $entry['slug'];
        $version = (int) $entry['pack_version'];
        return $kind === 'atlas'
            ? "assets/characters/{$slug}/{$slug}-atlas-v{$version}-mobile.json"
            : "assets/characters/{$slug}/{$slug}-spritesheet-v{$version}-mobile.png";
    }

    public function spriteUrl(): string
    {
        return $this->is_builtin
            ? asset($this->bundledPath('sprite') ?? $this->sprite_sheet_path)
            : Storage::disk('public')->url($this->sprite_sheet_path);
    }

    public function atlasUrl(): string
    {
        return $this->is_builtin
            ? asset($this->bundledPath('atlas') ?? $this->atlas_path)
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
