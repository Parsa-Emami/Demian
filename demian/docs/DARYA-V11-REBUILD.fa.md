# بازسازی کامل دریا و پیشی — V11

کاراکتر قبلی دریا از مسیر runtime خارج و Assetهای قدیمی آن بازنشسته شدند. پک جدید از اسپرایت‌شیت شفاف ارسالی ساخته شده و در هر فریم، پیشی به‌صورت baked-in همراه دریا باقی می‌ماند.

## قرارداد فنی

- سه variant استاندارد: `desktop` با سلول ۲۵۶، `mobile` با سلول ۱۹۲ و `compact` با سلول ۱۲۸
- Atlas شامل ۵۶ فریم شفاف در شبکه‌ی ۸×۷ است.
- انیمیشن‌های `idle`, `walk`, `run`, `sprint`, `jump`, `takeoff`, `fall`, `land`, `hop`, `skid`, `dash`, `slide`, `dodge`, `win`, `celebrate`, `dance`, `wave`, `salute`, `spin`, `crouch`, `laugh`, `pose`, `sleep` و `taunt` ثبت شده‌اند.
- رندر Canvas2D از `frameBlend` اختیاری استفاده می‌کند تا انتقال بین فریم‌ها نرم‌تر شود؛ رندر Three.js همان Atlas را با فیلتر Nearest و بدون mipmap نمایش می‌دهد.
- ردیف آخر پک، هشت حالت جهت‌دار را برای `n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw` فراهم می‌کند.

## فایل‌های اصلی

- `public/assets/characters/darya/darya-spritesheet-v11-*.png`
- `public/assets/characters/darya/darya-atlas-v11-*.json`
- `tools/build_darya_pack_v11.py`

نسخه‌ی Asset در `CharacterVisualContract.js`، `CharacterAssetService.php` و seeder برابر ۱۱ است تا داده‌ی قدیمی دیتابیس نیز به مسیر جدید resolve شود.
