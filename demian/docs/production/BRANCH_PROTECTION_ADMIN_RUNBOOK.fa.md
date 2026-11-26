# راهنمای فعال‌سازی Branch Protection و Required Checks — Demian

## وضعیت و حدود اختیارات
کد سیاست، اعتبارسنجی و دستور اعمال آن در ریپو ثبت می‌شود. حفاظت شاخه اصلی یک تنظیم مدیریتی GitHub است و با Commit یا Workflow به‌تنهایی فعال نمی‌شود. اتصال فعلی GitHub App اجازه Administration برای تغییر قوانین شاخه ندارد؛ تا وقتی مدیر مخزن دستور Apply را اجرا نکند و Readback موفق نباشد، وضعیت واقعی حفاظت **غیرفعال/تأییدنشده** است.

ریپو: https://github.com/Parsa-Emami/Demian
شاخه: main

## هشت Check اجباری با نام دقیق
1. release-qa — پذیرش نهایی Build و Backend
2. package — ساخت و آزمون واقعی بسته API برای cPanel روی CI
3. contract — کنترل قراردادهای Mobile11 و سیاست حفاظت
4. cpanel-runtime — آزمون API-only در PHP
5. build — ساخت و آزمون رابط و PWA
6. load-100 — صد کلاینت HTTP روی MySQL/PHP ایزوله (نه ظرفیت واقعی هاست)
7. backend / replay-and-api (sqlite)
8. backend / replay-and-api (mysql)

چهار Workflow اصلی برای همه PRهای مقصد main و همه Pushهای main اجرا می‌شوند:
- .github/workflows/deploy-demian-pages.yml
- .github/workflows/pr06-cpanel-release-acceptance.yml
- .github/workflows/mobile11-ops-ci.yml
- .github/workflows/pr09-100-client-security-ci.yml

هیچ Check اجباری نباید Path Filter داشته باشد؛ در غیر این صورت PRهای صرفاً مستنداتی می‌توانند برای همیشه Pending بمانند. Workflow Dispatch جایگزین Trigger خودکار Pull Request نیست. نام Jobها باید یکتا بماند.

## پیش‌نیاز اساسی
پیش از فعال‌سازی قانونی که یک تأیید مستقل می‌خواهد، دست‌کم یک Collaborator دیگر با مجوز Write یا بالاتر باید وجود داشته باشد. نویسنده PR نمی‌تواند PR خودش را تأیید کند. اگر فقط یک نفر به مخزن دسترسی داشته باشد، فعال‌سازی اجباری یک Reviewer می‌تواند ادغام‌های بعدی را متوقف کند. اسکریپت عمداً در نبود Reviewer مستقل Fail-closed می‌شود.

## اجرای مدیر مخزن روی سیستم امن

پس از Merge این PR به main و سبز شدن هر هشت Job روی SHA جدید، با حسابی که دسترسی Repository Administration دارد:

~~~bash
gh auth login
gh auth status
cd path/to/Demian/demian
bash ops/github/main_branch_protection.sh plan
bash ops/github/main_branch_protection.sh preflight
DEMIAN_BRANCH_PROTECTION_APPROVED=APPLY_MAIN_PROTECTION \
  bash ops/github/main_branch_protection.sh apply
bash ops/github/main_branch_protection.sh verify
~~~

توکن و Secret را در Git یا چت منتشر نکنید. حالت plan فقط JSON سیاست را نشان می‌دهد. preflight فقط عملیات Read-only انجام می‌دهد؛ Reviewer واجدشرایط و Checkهای موفق همان SHA را تأیید می‌کند. apply فقط با پرچم تأیید مشخص اجرا می‌شود. اگر بین خواندن و اعمال، HEAD تغییر کند متوقف می‌شود. اگر قانون دیگری قبلاً فعال باشد، آن را بازنویسی نمی‌کند و فقط راستی‌آزمایی می‌کند.

## تنظیمات سیاست
- Require a pull request before merging و حداقل یک Approval مستقل
- Dismiss stale pull request approvals
- Require approval of the most recent reviewable push
- Require conversation resolution
- Require status checks before merging و Require branches to be up to date (strict)
- Required Checks: هشت نام دقیق بالا
- Include administrators / Do not allow bypass
- Disable force pushes و Disable deletion
- No automatic Production deployment, coupon payout, or privilege escalation

مسیر جایگزین UI برای مدیر: GitHub Repository → Settings → Branches → Add classic branch protection rule → main. تمام گزینه‌های بالا انتخاب شود. پس از ذخیره باید با دستور verify از API واقعی GitHub تأیید کرد.

## پذیرش نهایی و شواهد
- پاسخ branches/main دارای protected=true باشد.
- پاسخ branches/main/protection دارای هشت Required Context دقیق، strict=true، enforce_admins.enabled=true، حداقل یک Review مستقل، stale dismissal، last push approval، conversation resolution، و ممنوعیت Force-Push/Delete باشد.
- یک PR فقط-مستندات هر هشت Job را اجرا کند.
- PR بدون Review یا با Check ناموفق امکان Merge نداشته باشد.
- اشتباه 403 Resource not accessible by integration نشان‌دهنده نبود دسترسی Administration کانکتور است؛ هرگز به معنی فعال‌شدن حفاظت نیست.

## تست ایمن
~~~bash
bash -n ops/github/main_branch_protection.sh
node --test tests/js/mobile/BranchProtectionPolicy.test.js
~~~
تست خودکار، GitHub CLI مصنوعی و پوشه موقت می‌سازد و هیچ قانون واقعی را تغییر نمی‌دهد. اسکریپت دستوری برای Unprotect یا Bypass ندارد. تغییر عمدی قانون موجود فقط از طریق مدیر و همراه با ثبت دلیل انجام شود.

این مرحله صرفاً حفاظت GitHub را پوشش می‌دهد. Issue #117 برای تأیید انتشار Production باز می‌ماند: Staging واقعی cPanel، آزمون سخت‌افزار Android/iOS، پذیرش هنری، بکاپ خارج هاست و بازیابی، تست مجاز ۵۰/۱۰۰ کاربر و بررسی مستقل صندوق‌دار و کوپن الزامات جداگانه هستند.
