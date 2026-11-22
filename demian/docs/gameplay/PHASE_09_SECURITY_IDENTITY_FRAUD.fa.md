# فاز ۹ — امنیت، هویت و ضدتقلب (F9-01 تا F9-14)

**دامنه:** فاز ۹ نقشه‌راه کیفیت ۱۱فازی Demian؛ با فازهای قدیمی مخزن یکی نیست. همهٔ تغییرات سمت سرور اعمال می‌شوند. سرور تنها مرجع رتبه، امتیاز، وضعیت OTP و کوپن است.

**نکتهٔ انتشار:** پیاده‌سازی فنی و تست خودکار به معنای فعال‌سازی OTP یا جایزه در Production نیست. برای پیامک واقعی، درگاه معتبر و اعتبار مالی، پذیرش انسان و دارندهٔ کافه الزامی است.

## پوشش فنی

| معیار | وضعیت و شواهد | گیت باقیمانده |
| --- | --- | --- |
| F9-01 Player Identity | `guest`, `registered_unverified`, `phone_verified` از سرور، نه LocalStorage. UI وضعیت را از API می‌خواند. | آزمایش کاربران قدیمی بدون شماره |
| F9-02 OTP واقعی | مسیر `/player/phone/otp` و `/player/phone/verify`، درگاه HTTPs با bearer key، شش رقم CSPRNG، پنج دقیقه انقضا، پنج تلاش حداکثر، ۶۰ ثانیه فاصله، سقف پنج ارسال در ساعت. هش HMAC؛ ارسال واقعی شرط فعال‌سازی، بدون Debug bypass. | تنظیم درگاه HTTPS، کلید، قرارداد JSON و تست ارسال به خط واقعی |
| F9-03 Session Security | Bearer ۶۴ نویسه، SHA256 در DB، انقضای مطلق، بازیابی یک‌بارمصرف موجود؛ `/player/session/rotate` و `/player/session/revoke` به صورت lock تراکنشی. | تست چندتب/قطع اینترنت در گوشی |
| F9-04 Multi-account | سیگنال‌های قدیمی شبکهٔ مشترک، الگوی همسان Replay و سرعت درخواست با HMAC و رسیدگی انسانی؛ هیچ قفل خودکار بابت IP یا Incognito. | پذیرش false-positive و اثبات سواستفاده با چند تلفن |
| F9-05 Replay Verification | Verify سمت Laravel برای هفت بازی/حالت‌های مجاز؛ `ReplayCompletionService` قفل player/run و تطبیق hash و version را حفظ می‌کند. | acceptance روایی/فیزیکی هر بازی |
| F9-06 Anti-Bot | قوانین rate/start/complete/replay و تشخیص burst/trace موجود؛ صرف heuristics دسترسی مالی نمی‌دهند. | fuzzing و آزمون فشار برنامه‌ریزی‌شده |
| F9-07 Rate Limiting | محدودیت IP + digest bearer برای درخواست OTP، verify، session و اعتراض؛ محدودیت‌های اجرا، ثبت‌نام و کوپن قبلاً وجود داشته‌اند. | آزمایش Redis/shared cache در چند worker Production |
| F9-08 Leaderboard Integrity | قفل، عدم قبول امتیاز ارسالی کلاینت، نسخه قوانین و هفتهٔ تهران، equal-score tie-break فعلی؛ اثبات سروری حفظ شده. | گیت‌های PHP/SQL و race |
| F9-09 Fair Scoring | `WeeklyFairScoringService` و فرآیند seal مالی فعلی، بر پایهٔ داده‌های verified. | دادهٔ واقعی هفت بازی برای calibration |
| F9-10 Coupon Integrity | تنها از snapshot مهروموم‌شده با کنترل hash و در transaction؛ شرط `assertVerifiedRecipient` تحت rollout مالی؛ redemption اتمیک فعلی. | تست اختصاصی صندوق واقعی و sponsor |
| F9-11 Cashier Authorization | Web session/CSRF و permission role، ورود staff با نشست نسخه‌دار و step-up رمز در تصمیم ضدتقلب؛ bearer player دسترسی ندارد. | acceptance نقش‌های صندوق‌دار/مدیر/سوپرادمین |
| F9-12 Fraud Audit/Appeals | گزارش سروری سیگنال و review/hold فعلی؛ اعتراض تک‌پرونده‌ای با متن رمزگذاری‌شده و رسیدگی سوپرادمین، بدون حذف خودکار رکورد/کوپن. | بررسی حقوقی متن اعتراض/دوره نگهداری |
| F9-13 Privacy | شماره تماس رمزگذاری شده، هش جداگانه، OTP هرگز ذخیرهٔ خام نمی‌شود، احراز هویت فقط حساب خود بازیکن؛ export گزارش اعتراض بدون متن خصوصی، حذف اکانت با cascade. | تأیید متن سیاست حریم خصوصی و retention با مسئول کافه |
| F9-14 Security Testing | PHPUnit: کد غلط/منقضی/تکرار، حدس OTP، هویت غریبه، چرخش/لغو، خطای درگاه، حذف حساب، اعتراض مالکیت/ممیزی/رمزگذاری، Node قرارداد مرزی و گیت CI قدیمی. | امنیت‌سنجی خارجی و آزمایش عملی race و coupon روی staging |

## سیاست مالی سخت‌گیرانه و مهاجرت

قابلیت صدور کوپن هفتگی و هدیهٔ دستی جداگانه با `DEMIAN_COUPONS_ISSUE_ENABLED` و `DEMIAN_COUPONS_MANUAL_GIFTS_ENABLED` از قبل خاموش است. بعد از migration و تکمیل درگاه پیامک، مسئول کافه باید در staging:

1. OTP و تأیید واقعی شماره را برای تمام حساب‌های مستعد جایزه، شامل کاربران قدیمی، کامل کند.
2. `DEMIAN_PRIZE_VERIFIED_PHONE_REQUIRED=true` را پس از پذیرش کاربری و حقوقی تنظیم کند.
3. سیاست تخفیف، کمپین، بودجه، تاریخ انقضا و نقش صندوق را به طور مستقل تأیید کند.
4. *سپس* اجازهٔ صدور مالی را باز کند. در Production اگر شرط verified-phone rollout برقرار نباشد، صدور حتی با `issue_enabled=true` هم **خطا می‌دهد**. در حالت rollout روشن، گیرندهٔ تأییدنشده موجب rollback صدور می‌شود؛ هیچ کوپن «موقتِ غیرمعتبر» نباید به مشتری نمایش داده شود.

حالت‌های مهمان، بدون تأیید شماره و تمرینی هنوز برای **بازی** وجود دارند؛ رکورد verified در لیدربورد به‌تنهایی حق تخفیف نیست. قابلیت جدید هیچ عدد امتیاز یا رتبهٔ سمت مرورگر را به سند مالی ارتقا نمی‌دهد.

## درگاه پیامک / استقرار

```dotenv
DEMIAN_PHONE_OTP_ENABLED=false
DEMIAN_PHONE_OTP_GATEWAY_URL=
DEMIAN_PHONE_OTP_GATEWAY_KEY=
DEMIAN_PRIZE_VERIFIED_PHONE_REQUIRED=false
```

درگاه باید **HTTPS** باشد و از درخواست زیر پشتیبانی کند:

- `POST` JSON: `{"to":"+98912...", "code":"123456", "template":"demian-player-verify"}`
- `Authorization: Bearer <API-KEY>` فقط در PHP، نه JavaScript؛ پاسخ 2xx یعنی پیامک واقعاً پذیرفته شده است.
- سقف timeout اتصال ۲ و کل ۵ ثانیه؛ هر شکست ثبت challenge را rollback می‌کند. کد فقط برای پیامک‌فرستادن استفاده می‌شود و نه در جواب API، DB، فایل یا لاگ.
- کلیدها باید از Secret Store هاست به env وارد شوند؛ **آدرس/کلید واقعی در این PR وجود ندارد**. اتصال ارائه‌دهندهٔ مشخص و DLR واقعی هنوز مستلزم قرارداد و credentials است.

## چند سیم‌کارت و چند گوشی

چند دستگاه یا چند سیم‌کارت به‌طور قطعی برابر یک انسان نیست. هیچ روش معمول صرفاً نرم‌افزاری نمی‌تواند این برابری را تضمین کند. آدرس مشترک کافه و Carrier NAT تنها سیگنال کم‌اعتبار است، نه مبنای محرومیت. راه‌کار عملی: سقف ارزش مالی، گزارش رفتار و Replay همسان، بررسی ادمین، حق اعتراض، و محدودیت موقت **فقط روی شروع بازی جدید** پس از بررسی. قابلیت فروش/هدیه یا رهگیری مخفیانهٔ دستگاه افزوده نشده است.

## پذیرش

- پیش از Production: migration واقعی + rollback روی staging، تست پیامک واقعی، 429، زمان انقضا، resend، invalid attempts، race، session rotation، privacy export/erase.
- ازمایش تحریف replay، UUID دور، تغییر نسخهٔ قوانین، درخواست هم‌زمان complete، تلاش دوبارهٔ مصرف کوپن و دسترسی role نامعتبر.
- گزارش CI با SHA دقیق، MySQL و SQLite، Asset/Browser QA؛ تست مرورگر به معنی تست درگاه SMS خارجی نیست.
- آزمون انسان روی چند سیم‌کارت، کوپن واقعی با صندوق، مدارک سیاست حریم خصوصی و طیف false-positive؛ تا آن زمان **Phase 9 financial rollout not accepted**.
