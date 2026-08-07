<?php

namespace App\Services\Characters;

use App\Models\Character;
use Illuminate\Support\Facades\Cache;

class CharacterAssetService
{
    /**
     * تولید مانیفست بهینه برای لودینگ اولیه
     */
    public function getOptimizedManifest(int $characterId, string $deviceType = 'desktop'): array
    {
        // کش کردن خروجی برای ۱ ساعت تا زمان لود بازی به صفر نزدیک شود
        return Cache::remember("character_manifest_{$characterId}_{$deviceType}", 3600, function () use ($characterId, $deviceType) {
            $character = Character::findOrFail($characterId);
            
            // تولید مسیر فایل ها بر اساس نام کاراکتر (مثلا amirreza)
            $charName = strtolower($character->name);
            
            // فقط فایل مربوط به پلتفرم کاربر ارسال شود، نه همه فایل ها
            return [
                'id' => $character->id,
                'name' => $charName,
                'atlas' => asset("assets/characters/{$charName}/{$charName}-atlas-v5-{$deviceType}.json"),
                'image' => asset("assets/characters/{$charName}/{$charName}-spritesheet-v5-{$deviceType}.png"),
            ];
        });
    }
}