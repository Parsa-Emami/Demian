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
     * این متد توسط CharacterController برای پاس شدن تست آپلود فراخوانی می‌شود
     */
    public function store(Character $character, array $files = []): void
    {
        // استفاده از slug یا name برای ساخت مسیر ذخیره‌سازی
        $charFolder = strtolower($character->slug ?? $character->name);

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

        // پاک کردن کش پس از آپلود یا ویرایش فایل جدید
        $this->clearCharacterCache($character->id);
    }

    /**
     * تولید مانیفست بهینه برای لودینگ اولیه
     */
    public function getOptimizedManifest(int $characterId, string $deviceType = 'desktop'): array
    {
        // کش کردن خروجی برای ۱ ساعت تا زمان لود بازی در محیط اوپن‌ورلد به صفر نزدیک شود
        return Cache::remember("character_manifest_{$characterId}_{$deviceType}", 3600, function () use ($characterId, $deviceType) {
            $character = Character::findOrFail($characterId);
            
            // تولید مسیر فایل ها بر اساس نام کاراکتر (مثلا amirreza)
            $charFolder = strtolower($character->slug ?? $character->name);
            
            // فقط فایل مربوط به پلتفرم کاربر ارسال شود، نه همه فایل ها
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
     * حذف فایل‌های یک کاراکتر (مورد استفاده در زمان پاک کردن کاراکتر)
     */
    public function delete(Character $character): void
    {
        $charFolder = strtolower($character->slug ?? $character->name);
        Storage::deleteDirectory("public/assets/characters/{$charFolder}");
        
        $this->clearCharacterCache($character->id);
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