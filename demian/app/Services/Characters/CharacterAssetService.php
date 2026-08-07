<?php

namespace App\Services\Characters;

use App\Models\Character;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;

class CharacterAssetService
{
    /**
     * ذخیره فایل‌های آپلودی کاراکتر جدید
     * نوع پارامتر اول به string تغییر یافت تا با کنترلر شما (که slug را می‌فرستد) هماهنگ شود
     */
    public function store(string $slug, $files = []): void
    {
        $charFolder = strtolower($slug);

        // آپلود فایل اطلس در صورت وجود
        if (isset($files['atlas']) && $files['atlas'] instanceof UploadedFile) {
            $files['atlas']->storeAs(
                "public/assets/characters/{$charFolder}", 
                "{$charFolder}-atlas-v5.json"
            );
        }

        // آپلود فایل اسپرایت‌شیت در صورت وجود
        if (isset($files['spritesheet']) && $files['spritesheet'] instanceof UploadedFile) {
            $files['spritesheet']->storeAs(
                "public/assets/characters/{$charFolder}", 
                "{$charFolder}-spritesheet-v5.png"
            );
        }

        // پیدا کردن کاراکتر و پاک کردن کش آن
        $character = Character::where('slug', $slug)->orWhere('name', $slug)->first();
        if ($character) {
            $this->clearCharacterCache($character->id);
        }
    }

    /**
     * تولید مانیفست بهینه برای لودینگ اولیه
     */
    public function getOptimizedManifest(int $characterId, string $deviceType = 'desktop'): array
    {
        // کش کردن خروجی برای ۱ ساعت تا زمان لود بازی در محیط اوپن‌ورلد به صفر نزدیک شود
        return Cache::remember("char_manifest_{$characterId}_{$deviceType}", 3600, function () use ($characterId, $deviceType) {
            $character = Character::findOrFail($characterId);
            
            $charFolder = strtolower($character->slug ?? $character->name);
            
            return [
                'id' => $character->id,
                'name' => $charFolder,
                'slug' => $character->slug,
                'atlas' => asset("assets/characters/{$charFolder}/{$charFolder}-atlas-v5-{$deviceType}.json"),
                'image' => asset("assets/characters/{$charFolder}/{$charFolder}-spritesheet-v5-{$deviceType}.png"),
            ];
        });
    }

    /**
     * حذف فایل‌های یک کاراکتر
     * این متد هم به جای مدل، string (slug) دریافت می‌کند
     */
    public function delete(string $slug): void
    {
        $charFolder = strtolower($slug);
        Storage::deleteDirectory("public/assets/characters/{$charFolder}");
        
        $character = Character::where('slug', $slug)->orWhere('name', $slug)->first();
        if ($character) {
            $this->clearCharacterCache($character->id);
        }
    }

    /**
     * متد کمکی برای پاکسازی کش
     */
    protected function clearCharacterCache(int $characterId): void
    {
        Cache::forget("character_manifest_{$characterId}_desktop");
        Cache::forget("character_manifest_{$characterId}_mobile");
        Cache::forget("character_manifest_{$characterId}_compact");
    }
}