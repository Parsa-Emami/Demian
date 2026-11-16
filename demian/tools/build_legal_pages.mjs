/** Step 32: generate portable, accessible, Persian legal information pages. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const policy = JSON.parse(readFileSync(new URL('../resources/legal/policy.json', import.meta.url), 'utf8'));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function buildLegalPages(out) {
    const approved = policy.status === 'approved' && process.env.DEMIAN_LEGAL_PUBLICATION_APPROVED === 'true';
    // Never silently ship an "approved" policy without the identity of the
    // real operator and a working privacy contact. Source review is mandatory.
    if (process.env.DEMIAN_LEGAL_PUBLICATION_APPROVED === 'true' && !approved) {
        throw new Error('Legal publication requires reviewed policy status and independent operator sign-off.');
    }
    const title = 'دمیان — ';
    const draft = '<aside class="notice" role="note"><strong>پیش‌نویس در انتظار بررسی حقوقی و تأیید متولی کافه.</strong> ' +
        'این متن پیش از آغاز مسابقه با جوایز واقعی، همراه با نام متولی، راه تماس و شرایط نهایی بازبینی می‌شود.</aside>';
    const nav = '<nav aria-label="صفحات حقوقی"><a href="../">بازی دمیان</a>' +
        '<a href="../privacy/">حریم خصوصی</a><a href="../terms/">شرایط استفاده</a>' +
        '<a href="../competition-rules/">قوانین رقابت</a></nav>';
    const css = [
        '*{box-sizing:border-box}html{color-scheme:dark}body{margin:0;background:#101b18;color:#edf5ef;',
        'font:16px/2 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}main{max-width:860px;',
        'margin:0 auto;padding:36px 20px 86px}nav{display:flex;flex-wrap:wrap;gap:12px;padding:14px 20px;',
        'border-bottom:1px solid #425d51;background:#172822}a{color:#b6e9c7;text-underline-offset:4px}',
        'nav a{border-radius:12px;padding:7px 10px}nav a:focus-visible,a:focus-visible{outline:3px solid #f7df9d}',
        'h1{font-size:clamp(1.8rem,5vw,2.8rem);line-height:1.5}h2{font-size:1.25rem;margin-top:2em}',
        'p,li{max-width:74ch}ul{padding-inline-start:25px}.meta{color:#b1c9bc;font-size:.94rem}',
        '.notice{padding:18px 20px;border:1px solid #b69e58;border-radius:18px;background:#2d3023}',
        'footer{margin-top:48px;border-top:1px solid #425d51;padding-top:18px;color:#a9bcb0}',
        '@media(max-width:520px){main{padding:22px 17px 65px}nav{gap:6px}nav a{padding:6px}}'
    ].join('');
    const sections = {
        privacy: {
            heading: 'سیاست حریم خصوصی',
            html: '<h2>چه اطلاعاتی نگهداری می‌شود؟</h2>' +
                '<p>برای حساب آنلاین: شناسه تصادفی و نام نمایشی، هش توکن دسترسی و بازیابی، زمان انقضای نشست، نسخه و زمان پذیرش قوانین. ' +
                'برای رقابت: نوع بازی، شواهد بازپخش و امتیاز تأییدشده، زمان اجرا و نتایج مسابقات هفتگی. ' +
                'برای جوایز در صورت فعال‌سازی مجاز: وضعیت، مبلغ یا درصد تخفیف و سوابق مصرف. ' +
                'برای مقابله با تقلب در حالت فعال: رخدادها، شمارنده‌ها و مشتق‌های غیرمستقیم نشانی شبکه. ' +
                'بازی برای ثبت حساب آنلاین به شماره تلفن و ایمیل نیاز ندارد.</p>' +
                '<h2>اطلاعات این دستگاه</h2><p>تنظیمات، رکوردهای تمرینی، وضعیت دانلود آفلاین و شواهد ارسال‌نشده ممکن است در ' +
                'حافظه مرورگر بمانند. توکن ورود تا حد امکان در نشست مرورگر قرار می‌گیرد؛ کد پشتیبان را فقط شما دریافت و خارج از برنامه نگه می‌دارید. ' +
                'حذف داده‌های مرورگر می‌تواند دسترسی یا رکوردهای تمرینی را از بین ببرد.</p>' +
                '<h2>هدف و دسترسی</h2><p>اطلاعات برای اجرای بازی و حساب، احراز هویت، رتبه‌بندی، بررسی تقلب، ' +
                'رسیدگی به جوایز و پشتیبانی عملیاتی استفاده می‌شوند. لیدربورد عمومی نام نمایشی و امتیاز را نشان می‌دهد، ' +
                'نه کد دسترسی یا اطلاعات محرمانه. حساب و کیف جوایز برای دارندهٔ توکن معتبر قابل مشاهده است.</p>' +
                '<h2>نگهداری و حذف</h2><p>شواهد خام بازپخش عادی طبق سیاست جاری پس از حدود ' +
                escape(policy.retained_replay_days) + ' روز برای پاک‌سازی برنامه‌ریزی می‌شوند. مشاهدات امنیتی تا ' +
                escape(policy.anticheat_observation_days) + ' روز و گزارش‌های بررسی‌شده تا ' +
                escape(policy.closed_anticheat_report_days) + ' روز در سیاست فعلی تعریف شده‌اند. ' +
                'سوابق تسویه مالی/جوایز و نسخه‌های پشتیبان ممکن است به‌علت الزامات ممیزی یا قوانین قابل‌اجرا مدت بیشتری نگهداری شوند؛ ' +
                'مدت دقیق پیش از انتشار عمومی باید نهایی شود.</p>' +
                '<h2>دسترسی، اصلاح و حذف</h2><p>در بخش لیدربورد می‌توانید نام نمایشی را اصلاح کنید، ' +
                'خلاصهٔ داده‌های حسابتان را دریافت کنید، یا حساب و اطلاعات مستقیم مرتبط را حذف نمایید. ' +
                'برای رکوردهای متعدد، API خصوصی خروجی صفحه‌بندی‌شده ارائه می‌دهد؛ داده‌های محرمانه امنیتی و کدهای ورود صادر نمی‌شوند. ' +
                'حذف حساب ممکن است به‌معنای حذف سوابق مالی غیرقابل حذف یا نسخهٔ پشتیبان در همان لحظه نباشد.</p>' +
                '<h2>میزبانی، تماس و تغییر سیاست</h2><p>بازی روی ' + escape(policy.public_origin) +
                ' و API روی ' + escape(policy.api_origin) +
                ' پیش‌بینی شده‌اند. مشخصات متولی، ارائه‌دهندگان نهایی میزبانی و روش تماس مسئول حریم خصوصی ' +
                'پیش از راه‌اندازی رقابت جایزه‌دار باید اعلام شوند. نسخه‌های جدید قوانین مستلزم پذیرش متناسب خواهند بود.</p>'
        },
        terms: {
            heading: 'شرایط استفاده',
            html: '<h2>دامنه خدمات</h2><p>دمیان شامل شش بازی مرورگری و حالت تمرینی است. ' +
                'ساخت حساب آنلاین اختیاری است و تنها ثبت امتیازهای سرورتأییدشده در جدول‌های رقابتی معتبر خواهد بود. ' +
                'نسخه‌های آزمایشی و آفلاین مبنای جایزه نیستند.</p>' +
                '<h2>امنیت حساب</h2><p>کد بازیابی و توکن را در اختیار دیگران نگذارید. ' +
                'استفاده از ابزار تغییر امتیاز، ارسال بازپخش ساختگی، سوءاستفاده از حساب دیگران، ' +
                'اختلال عمدی در سرور یا دورزدن محدودیت‌های رقابت مجاز نیست. ' +
                'اقدامات بررسی تقلب باید مستند و با حق اعتراض همراه باشند.</p>' +
                '<h2>دسترسی و تغییر سرویس</h2><p>قطع اینترنت، مرورگر ناسازگار یا به‌روزرسانی می‌تواند بازی آنلاین را مختل کند. ' +
                'قوانین امتیازدهی هر دوره باید پیش از آغاز آن روشن باشند و پس از بستن دوره به‌صورت مخفیانه تغییر نکنند. ' +
                'همهٔ شرایط نهایی جوایز و شرایط سنی، پس از تأیید متولی منتشر می‌شوند.</p>' +
                '<h2>اطلاعات و حقوق کاربر</h2><p>برای شیوه استفاده از داده‌ها و حذف حساب، ' +
                '<a href="../privacy/">سیاست حریم خصوصی</a> را مطالعه کنید. ' +
                'برای جوایز و زمان‌بندی به <a href="../competition-rules/">قوانین رقابت</a> مراجعه کنید.</p>'
        },
        'competition-rules': {
            heading: 'قوانین رقابت هفتگی و جوایز',
            html: '<h2>نحوه شرکت</h2><p>شش بازی دمیان مستقل اجرا می‌شوند و بازیکنان همدیگر را در محیط بازی نمی‌بینند. ' +
                'فقط حالتی که در API به‌عنوان رقابتی و با اعتبارسنجی سروری معرفی شده، امتیاز رسمی دارد؛ ' +
                'سایر حالت‌ها تمرینی‌اند. امتیاز از بازپخش تأییدشده سرور محاسبه می‌شود، نه عدد فرستاده‌شده از مرورگر.</p>' +
                '<h2>دوره و جدول</h2><p>هفتهٔ رقابتی بر پایه ساعت آسیا/تهران از شنبه ۰۰:۰۰ تا شروع شنبه بعد محاسبه می‌شود. ' +
                'جدول زنده موقت است؛ نتیجه رسمی فقط پس از پایان دوره، ممیزی و قفل‌کردن نتیجه تعیین می‌شود. ' +
                'رتبه یک بازی به‌تنهایی تضمین‌کننده جایزه نیست؛ مدل امتیاز منصفانه و شرایط مشارکت اعمال می‌شوند.</p>' +
                '<h2>تخفیف‌ها و تحویل</h2><p>تا زمان تصویب خط‌مشی و فعال‌سازی مدیریتی، ' +
                'هیچ کد تخفیف واقعی به‌صورت خودکار صادر نمی‌شود. پس از تأیید، ' +
                'مقدار، تاریخ انقضا، محدودیت مصرف و تعداد جوایز هر دوره باید از قبل مشخص باشد. ' +
                'کد معتبر صرفاً در بخش «تخفیف‌های من» نمایش داده می‌شود و ایمیل نمی‌گردد؛ ' +
                'نهایی‌کردن مصرف کد فقط توسط صندوق‌دار مجاز در کافه انجام می‌شود.</p>' +
                '<h2>تقلب، اعتراض و محدودیت‌ها</h2><p>ارسال امتیاز ساختگی، چندحسابی سوءاستفاده‌گرانه، ' +
                'بازپخش غیرمجاز و دورزدن قوانین قابل بررسی هستند. هرگونه تصمیم مؤثر بر جایزه باید با شواهد و بازبینی انسانی باشد. ' +
                'شرایط سن، مشارکت، واحد پول، ارزش تخفیف، سقف تخفیف، درخواست رسیدگی و راه تماس قبل از مسابقهٔ جایزه‌دار نهایی می‌شوند.</p>' +
                '<p><strong>این پیش‌نویس تعهدی برای صدور جایزه ایجاد نمی‌کند.</strong></p>'
        }
    };
    for (const [slug, definition] of Object.entries(sections)) {
        const canonical = policy.pages[slug === 'competition-rules' ? 'competition' : slug];
        const html = '<!doctype html>\n<html lang="fa" dir="rtl"><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
            (approved ? '' : '<meta name="robots" content="noindex,nofollow">') +
            '<meta name="referrer" content="strict-origin-when-cross-origin">' +
            '<link rel="canonical" href="' + escape(canonical) + '">' +
            '<title>' + title + escape(definition.heading) + '</title><style>' + css + '</style></head><body>' +
            nav + '<main><p class="meta">Demian · demiancafe.ir · نسخه ' +
            escape(policy.version) + '</p><h1>' + escape(definition.heading) + '</h1>' +
            (approved ? '' : draft) + definition.html +
            '<footer>نسخه سند: ' + escape(policy.version) +
            ' · برای بازگشت به بازی <a href="../">اینجا بزنید</a>.</footer></main></body></html>\n';
        const directory = join(out, slug);
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, 'index.html'), html);
    }
    return { status: approved ? 'approved' : 'draft', version: policy.version, paths: Object.keys(sections) };
}
