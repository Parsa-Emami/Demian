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
     * این متد اکنون هم آبجکت فایل تکی و هم آرایه فایل‌ها را به درستی مدیریت می‌کند
     */
    public function store(string $slug, mixed $fileOrFiles = null): void
    {
        $charFolder = strtolower($slug);

        // ۱. اگر کنترلر مستقیماً یک فایل تکی را پاس داده باشد (حالتی که در تست شما رخ می‌دهد)
        if ($fileOrFiles instanceof UploadedFile) {
            $fileOrFiles->storeAs(
                "public/assets/characters/{$charFolder}", 
                $fileOrFiles->getClientOriginalName()
            );
        } 
        // ۲. اگر کنترلر آرایه‌ای از فایل‌ها (مثل atlas و spritesheet) را پاس داده باشد
        elseif (is_array($fileOrFiles)) {
            foreach ($fileOrFiles as $key => $file) {
                if ($file instanceof UploadedFile) {
                    $file->storeAs(
                        "public/assets/characters/{$charFolder}", 
                        $file->getClientOriginalName()
                    );
                }
            }
        }

        // پیدا کردن کاراکتر و پاک کردن کش آن برای جلوگیری از نمایش دیتای قدیمی
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
        Cache::forget("char_manifest_{$characterId}_desktop");
        Cache::forget("char_manifest_{$characterId}_mobile");
        Cache::forget("char_manifest_{$characterId}_compact");
    }
}