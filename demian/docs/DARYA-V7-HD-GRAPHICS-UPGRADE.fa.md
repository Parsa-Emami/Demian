# ارتقای گرافیک Darya به Character Pack V7 (HD)

این پچ زیرساخت رندر و asset pipeline کاراکتر `darya` را طوری ارتقا می‌دهد که یک pack با تراکم پیکسلی بالاتر (v7) به‌صورت درجا و امن در کنار v6 اضافه شود، بدون این‌که هیچ کاراکتر دیگری تحت تأثیر قرار بگیرد.

## این پچ دقیقاً چه‌کاری کرد (و چه‌کاری نکرد)

**کاری که واقعاً انجام شد:** فریم‌های موجود Darya (همان ۲۵۲ فریم / ۳۲ انیمیشن تأییدشده‌ی v6) با یک pipeline پردازش تصویر لبه‌آگاه (`tools/build_hd_character_pack.py`) به تراکم پیکسلی ۱.۵× بازنمونه‌برداری شدند: cubic resample → bilateral edge-preserving denoise → unsharp mask → palette quantize → snap سخت آلفا. نتیجه یک sprite sheet واقعاً تولیدشده و اعتبارسنجی‌شده است (نه mockup)، با جزئیات و لبه‌های تمیزتر در همان اندازه‌ی جهانی (world size) قبلی.

**کاری که این پچ نمی‌تواند انجام دهد:** پوز جدید، انیمیشن جدید، طراحی مو/لباس جدید یا هر جزئیات هنری‌ای که در source art اصلی وجود نداشت. آن‌ها را نمی‌شود از یک عکس ۲۵۶×۲۵۶ «استخراج» کرد؛ به هنر مرجع تازه (concept art + یک هنرمند یا یک ابزار image-generation واقعی) نیاز دارند که بعداً در `public/assets/characters/darya/` قرار گیرد و با همین ابزارها به atlas تبدیل شود.

## فایل‌های asset جدید

برای هر سه variant (`desktop`, `mobile`, `compact`) یک جفت فایل جدید ساخته شد:

| Variant | ابعاد v6 → v7 | حجم PNG v6 → v7 |
|---|---|---|
| desktop | 5376×3072 → 8064×4608 | 10.1MB → 4.2MB |
| mobile | 4032×2304 → 6048×3456 | 6.9MB → 3.2MB |
| compact | 2688×1536 → 4032×2304 | 3.7MB → 2.1MB |

حجم فایل با وجود رزولوشن بالاتر **کاهش** پیدا کرده، چون pipeline از همان quantize پالت هوشمندی استفاده می‌کند که v5/v6 هم استفاده کرده بودند (`rebuild_8bit_character_art.py`). هر سه variant با `tools/audit_character_sprite_packs.py --version 7 --write-metadata --strict` اعتبارسنجی شدند: `artIntegrity = valid`، ۲۵۲ فریم سالم، body ratio معتبر.

فایل‌های v6 دست‌نخورده باقی مانده‌اند (برای CI/سازگاری قدیمی) — این یک افزودن است، نه جایگزینی.

## معماری: چرا هیچ کاراکتر دیگری تحت تأثیر قرار نگرفت

`CharacterVisualContract.js` قبلاً یک نسخه‌ی pack سراسری (`CHARACTER_PACK_VERSION = 6`) برای همه‌ی کاراکترها داشت. این پچ یک لایه‌ی override بر اساس slug اضافه کرد:

```js
export const CHARACTER_PACK_VERSION_OVERRIDES = Object.freeze({
    darya: 7,
});
export function characterPackVersion(slug) { /* darya -> 7, بقیه -> 6 */ }
```

`characterAssetRelativePath()` اکنون از `characterPackVersion(slug)` استفاده می‌کند. یعنی:

- مسیر رندر سه‌بعدی (`SpriteCharacter.js` → `SpriteAnimator.js`، Three.js billboard sprite) و مسیر Canvas2D (`CanvasCharacterAvatar.js` → `PixelActorRenderer.js`، استفاده‌شده در open-world/hide-and-seek/role-play/event) هر دو از همین یک تابع resolve می‌کنند — هر دو مسیر همزمان و بدون تغییر کد اضافه، HD واقعی Darya را دریافت می‌کنند.
- هر کاراکتر دیگر (`tiam`, `ronak`, `amirreza`, `parsa`, `iman`, `uzudi`, `setayesh`, `mojtaba`) دقیقاً همان رفتار قبلی را دارد چون در override map نیست.
- افزودن کاراکتر بعدی به HD صرفاً یعنی: `build_hd_character_pack.py --slug X` را اجرا کنید، اعتبارسنجی کنید، و یک خط به `CHARACTER_PACK_VERSION_OVERRIDES` اضافه کنید.

## Sub-frame motion smoothing (زیرساخت، opt-in)

`FrameAnimator.js` دو متد read-only جدید گرفت: `frameProgress()` (پیشرفت ۰..۱ درون فریم فعلی) و `nextFrameName()` (نام فریم بعدی با احترام به loop). این‌ها هیچ رفتار موجودی را تغییر نمی‌دهند — فقط اطلاعات محاسبه می‌کنند.

مسیر Canvas2D (`PixelActorRenderer.js` → `drawSpriteCharacter`) از این هوک‌ها برای cross-fade اختیاری استفاده می‌کند: وقتی `atlas.render.frameBlend === true`، یک لایه‌ی کم‌رنگ از فریم بعدی روی فریم فعلی رسم می‌شود (حداکثر آلفا با `render.frameBlendMaxAlpha`، پیش‌فرض ۰.۳۲ برای Darya) تا حرکت نرم‌تری حس شود. این پرچم فقط در atlas v7 Darya فعال است؛ atlas سایر کاراکترها این کلید را ندارد پس رفتارشان بیت‌به‌بیت با قبل یکسان می‌ماند (پوشش تست: `tests/js/CharacterFrameBlend.test.js`).

مسیر سه‌بعدی (`SpriteAnimator.js`/`SpriteCharacter.js`) عمداً به این cross-fade مجهز نشده. آن مسیر یک `THREE.Sprite` با یک texture و offset/repeat است؛ اضافه‌کردن یک sprite دوم برای blend نیاز به تغییرات ساختاری بیشتری در یک فایل حیاتی ۸۷۹ خطی دارد که بدون مرورگر واقعی برای تست بصری WebGL، ریسک آن توجیه نداشت. هوک‌های `frameProgress`/`nextFrameName` از همین حالا برای یک پچ بعدی روی مسیر سه‌بعدی آماده‌اند.

## تست‌ها

- `tests/js/CharacterVisualContract.test.js`: رفتار override نسخه‌ی pack (`characterPackVersion`, مسیرهای v7 برای darya، v6 برای بقیه).
- `tests/js/CharacterFrameBlend.test.js` (جدید): رفتار خالص `frameProgress`/`nextFrameName`، و این‌که `drawSpriteCharacter` بدون پرچم دقیقاً همان یک `drawImage` قبلی را انجام می‌دهد و با پرچم، دقیقاً یک `drawImage` دوم با آلفای محاسبه‌شده اضافه می‌کند.
- کل سوییت (`npm run test:js`): ۱۹۰/۱۹۰ pass (۱۸۶ قبلی + ۴ تست جدید).

## اجرای مجدد/گسترش برای کاراکترهای دیگر

```bash
python3 tools/build_hd_character_pack.py --slug <SLUG>
python3 tools/audit_character_sprite_packs.py <SLUG> --version 7 --write-metadata --strict
# سپس یک خط در CHARACTER_PACK_VERSION_OVERRIDES اضافه کنید.
```

## قدم بعدی واقعی برای «گرافیک بهتر» به‌معنای هنر جدید

اگر منظور از ارتقا صرفاً تراکم پیکسلی بیشتر روی همان پوزها نیست بلکه واقعاً hairstyle/outfit جزئی‌تر، فریم‌های میانی دست‌کشیده (نه upscale)، یا انیمیشن‌های تازه است، آن مرحله به هنر مرجع جدید نیاز دارد — یعنی تولید/دریافت concept art جدید برای Darya و اجرای همان build pipeline (`build_arcade_animation_pack_v6.py`-style) روی آن هنر. این پچ فقط زیرساخت (per-character pack version + HD asset واقعی + hook نرمی حرکت) را آماده کرد تا آن مرحله، هر وقت هنر جدید آماده شد، بلافاصله و بدون تغییر کد بیشتر نمایش داده شود.
