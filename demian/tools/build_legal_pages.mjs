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
    const operator = approved ? '<p>متولی: ' + escape(policy.operator_name)
        + ' · تماس: <a href="mailto:' + escape(policy.privacy_contact_email) + '">'
        + escape(policy.privacy_contact_email) + '</a></p>' : '';
    const sections = {
        privacy: {
            heading: 'سیاست حریم خصوصی',
            html: '<p>برای حساب آنلاین، نام و یک راه ارتباطی ثبت می‌شود تا بتوانیم دربارهٔ حساب یا جایزه به شما اطلاع بدهیم. راه تماس در جدول امتیازات نمایش داده نمی‌شود.</p>' +
                '<p>برای دریافت جایزه، مالکیت شماره با پیامک تأیید می‌شود. شماره رمزگذاری و برای یکتایی از شناسه کلیددار استفاده می‌شود. کد پیامک پس از ۵ دقیقه منقضی و پاک می‌شود؛ شمارنده ارسال حداکثر ۲۴ ساعت و شناسه تصادفی مرورگر حداکثر ۳۰ روز پس از آخرین مشاهده باقی می‌مانند. مرورگر مشترک یا IP مشترک به‌تنهایی دلیل مسدودسازی نیست. ارائه‌دهنده مصوب پیامک فقط شماره و کد لازم برای ارسال را دریافت می‌کند.</p>' +
                '<p>پس از حذف حساب، شماره تأییدشده و سوابق دستگاه حذف می‌شوند. برای جلوگیری از دریافت دوباره جایزه، شناسه کلیددار محدود به هفته و بدون شماره خام تا ۲۸ روز پس از تسویه (یا پایان تعهد باز) حفظ می‌شود. فرایند بازیابی حساب تأییدشده به کد بازیابی و پیامک جدید نیاز دارد.</p>' +
                '<p>رکوردهای رقابتی و سوابق استفاده از تخفیف نگهداری می‌شوند. برای مشاهده یا حذف اطلاعات حساب از بخش لیدربورد استفاده کنید.</p>' + operator,
        },
        terms: {
            heading: 'شرایط استفاده',
            html: '<p>برای رقابت با حساب خودتان وارد شوید. امتیاز فقط پس از بررسی بازی ثبت می‌شود. دست‌کاری امتیاز یا ساخت حساب‌های متعدد برای دریافت جایزه خلاف قوانین است.</p>' +
                '<p>کد بازیابی و کد تخفیف را فقط نزد خودتان نگه دارید. <a href="../privacy/">سیاست حریم خصوصی</a> و <a href="../competition-rules/">قوانین رقابت</a> را بخوانید.</p>',
        },
        'competition-rules': {
            heading: 'قوانین رقابت هفتگی و جوایز',
            html: '<p>هفتهٔ رقابت از شنبه ساعت ۰۰:۰۰ به وقت تهران آغاز می‌شود. نتیجه پس از پایان هفته و بررسی رکوردها اعلام می‌شود.</p>' +
                '<p>هر شماره تأییدشده در هر هفته حداکثر یک جایزه می‌گیرد، حتی اگر در چند بازی رتبهٔ بالا داشته باشد. کد تخفیف جایزه ۱۴ روز پس از اعلام نتیجه اعتبار دارد.</p>' +
                '<p>اگر کد تخفیف داری، آن را در «تخفیف‌های من» می‌بینی. برای استفاده، همان صفحه را به صندوق کافه نشان بده.</p>',
        },
    };
    for (const [slug, definition] of Object.entries(sections)) {
        const canonical = policy.pages[slug === 'competition-rules' ? 'competition' : slug];
        const html = '<!doctype html>\n<html lang="fa" dir="rtl"><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
            (approved ? '' : '<meta name="robots" content="noindex,nofollow">') +
            '<meta name="referrer" content="strict-origin-when-cross-origin">' +
            '<link rel="canonical" href="' + escape(canonical) + '">' +
            '<title>' + title + escape(definition.heading) + '</title><style>' + css + '</style></head><body>' +
            nav + '<main><h1>' + escape(definition.heading) + '</h1>' +
            (approved ? '' : draft) + definition.html +
            '<footer><a href="../">بازگشت به بازی</a></footer></main></body></html>\n';
        const directory = join(out, slug);
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, 'index.html'), html);
    }
    return { status: approved ? 'approved' : 'draft', version: policy.version, paths: Object.keys(sections) };
}
