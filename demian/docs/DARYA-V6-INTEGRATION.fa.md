# یکپارچه‌سازی Darya + Pishi با Character Pack V6

کاراکتر `darya` به‌عنوان Built-in Character به بازی اضافه شده و تمام assetهای runtime آن با قرارداد V6 تولید شده‌اند.

## قرارداد همراه

`Pishi / پیشی` بخشی از silhouette هر فریم Darya است و به‌صورت جداگانه در runtime spawn نمی‌شود. این تصمیم عمداً باعث می‌شود پیشی در تمام حالت‌ها، رزولوشن‌ها و game modeهایی که Character Visual Service را استفاده می‌کنند همیشه همراه دریا بماند. همین قرارداد در `darya-character.json` و manifestهای V5/V6 نیز با `alwaysVisible` و `bakedIntoEveryFrame` ثبت شده است.

## pipeline

ورودی canonical یک spritesheet شفاف 4×3 با ۱۲ pose پایه است. سپس V4 و V5 ساخته می‌شوند، V5 از مسیر 8-bit rebuild عبور می‌کند و در نهایت V6 با ۲۵۲ فریم برای سه variant زیر تولید می‌شود:

- desktop: cell 256×256، sheet 5376×3072
- mobile: cell 192×192، sheet 4032×2304
- compact: cell 128×128، sheet 2688×1536

ابزارهای character-art اکنون targetها را از فایل‌های موجود کشف می‌کنند و می‌توان یک slug مشخص را به builderها داد؛ بنابراین اضافه‌کردن کاراکترهای بعدی به hard-code کردن roster در هر اسکریپت وابسته نیست.

## runtime

Darya در built-in roster، Character Visual Contract، fallback rendering و database seeder ثبت شده است. مسیر backend برای built-in manifest نیز با V6 هم‌تراز شده تا API و runtime هر دو از یک نسخه‌ی canonical استفاده کنند.

## validation

برای Darya این بررسی‌ها انجام شده‌اند:

- 252 frame در هر V6 variant
- PNG با RGBA و ابعاد canonical
- atlas بدون animation رزمی ممنوع V6
- `artIntegrity = valid`
- pivot و canonical world size معتبر
- Pishi در source art هر ۱۲ pose حضور دارد و تمام فریم‌های V6 از همین poseهای همراه ساخته شده‌اند
