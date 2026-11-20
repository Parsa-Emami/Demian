<section class="panel">
<h2>مقایسه با دوره قبل</h2>
<p class="muted">دوره قبل: {{ $bi['comparison']['from'] }} تا پیش از {{ $bi['comparison']['until_exclusive'] }}. درصد تغییر با مبنای صفر نامشخص است.</p>
<table><thead><tr><th>شاخص</th><th>اکنون</th><th>قبل</th><th>تغییر</th></tr></thead><tbody>
@foreach(['registrations'=>'ثبت نام','active_players'=>'بازیکن فعال','verified_runs'=>'بازی معتبر'] as $key=>$label)
@php($r=$changes[$key])
<tr><td>{{ $label }}</td><td>{{ number_format($r['current']) }}</td><td>{{ number_format($r['previous']) }}</td><td>{{ $r['change_percent']===null?'—':$r['change_percent'].'٪' }}</td></tr>
@endforeach
@foreach($bi['comparison']['receipts_by_currency'] as $m)
@foreach(['receipts'=>'رسید','gross_minor'=>'سبد ناخالص','discount_minor'=>'تخفیف','net_minor'=>'خالص'] as $key=>$label)
<tr><td>{{ $label }} ({{ $m['currency'] }})</td><td>{{ number_format($m[$key]['current']) }}</td><td>{{ number_format($m[$key]['previous']) }}</td><td>{{ $m[$key]['change_percent']===null?'—':$m[$key]['change_percent'].'٪' }}</td></tr>
@endforeach
@endforeach
<tr><td>ورود از QR</td><td>{{ $bi['comparison']['qr']['current'] }}</td><td>{{ $bi['comparison']['qr']['previous'] }}</td><td>{{ $bi['comparison']['qr']['change_percent']===null?'—':$bi['comparison']['qr']['change_percent'].'٪' }}</td></tr>
</tbody></table>
</section>
<section class="panel">
<h2>اقتصاد خریدهای کوپنی</h2>
<p class="muted">فقط رسیدهای حضوری دارای کوپن. واحدها به تفکیک ارز؛ نه کل درآمد یا سود.</p>
@foreach(['receipts_by_branch'=>['عنوان شعبه','branch_id'],'receipts_by_source'=>['منبع کوپن','source']] as $key=>$labels)
<h3>{{ $labels[0] }}</h3>
<table><thead><tr><th>{{ $labels[0] }}</th><th>ارز</th><th>رسید</th><th>ناخالص</th><th>تخفیف</th><th>خالص</th><th>میانگین سبد</th></tr></thead><tbody>
@forelse($bi[$key] as $m)<tr><td>{{ $m[$labels[1]]??'نامشخص' }}</td><td>{{ $m['currency'] }}</td><td>{{ $m['receipts'] }}</td>
@foreach(['gross_minor','discount_minor','net_minor','average_basket_minor'] as $k)<td>{{ $m[$k]===null?'—':number_format($m[$k]) }}</td>@endforeach
</tr>@empty<tr><td colspan="7">بدون داده</td></tr>@endforelse
</tbody></table>
@endforeach
@php($r=$bi['return_purchases'])
<p>مالک‌های حسابِ شناخته‌شده با خرید کوپنی: {{ $r['known_coupon_owner_accounts'] }} · دو خرید یا بیشتر: {{ $r['repeat_coupon_owner_accounts'] }} · نرخ تکرار: {{ $r['repeat_percent']===null?'—':$r['repeat_percent'].'٪' }} · رسیدهای مالک حذف‌شده: {{ $r['receipts_with_erased_owner'] }}</p>
<p class="muted">خرید تکراری بر اساس مالک حساب کوپن، نه هویت واقعی خریدار یا تمام خریدهای او.</p>
<h3>کوپن‌های صادرشده در دوره</h3>
<table><thead><tr><th>منبع</th><th>ارز</th><th>تعداد صادرشده</th><th>مصرف حضوری تا پایان</th><th>نرخ</th><th>حداکثر تعهد صدور</th></tr></thead><tbody>
@forelse($bi['coupon_sources'] as $m)<tr><td>{{ $m['source'] }}</td><td>{{ $m['currency'] }}</td><td>{{ $m['issued'] }}</td><td>{{ $m['redeemed'] }}</td><td>{{ $m['redemption_percent']===null?'—':$m['redemption_percent'].'٪' }}</td><td>{{ number_format($m['issued_cap_minor']) }}</td></tr>@empty<tr><td colspan="6">بدون داده</td></tr>@endforelse
</tbody></table>
<h3>تعهد باز کوپن‌ها (زنده)</h3>
<table><thead><tr><th>منبع</th><th>ارز</th><th>تعداد معتبر</th><th>حداکثر مبلغ</th></tr></thead><tbody>
@forelse($bi['live_liability']['rows'] as $m)<tr><td>{{ $m['source'] }}</td><td>{{ $m['currency'] }}</td><td>{{ $m['outstanding'] }}</td><td>{{ number_format($m['maximum_minor']) }}</td></tr>@empty<tr><td colspan="4">تعهد باز ثبت نشده</td></tr>@endforelse
</tbody></table>
</section>
<section class="panel">
<h2>عملکرد QR میزها</h2>
<p>ورود ثبت‌شده: {{ number_format($bi['qr']['launches']) }} · روز-میزهای اشباع‌شده: {{ $bi['qr']['saturated_table_days'] }}</p>
@if($bi['qr']['status']==='lower_bound')<p class="alert" role="alert">سقف ثبت برخی میزها پر شده؛ تعداد گزارش‌شده حد پایین است.</p>@endif
<p class="muted">این شمارش، ورود از دکمه QR است؛ نه اسکن یکتا، حضور واقعی، رزرو یا خرید. اتصال فردی به رسید وجود ندارد.</p>
<table><thead><tr><th>شعبه</th><th>میزهای دارای داده</th><th>ورود</th></tr></thead><tbody>
@forelse($bi['qr']['branches'] as $r)<tr><td>{{ $r['branch'] }}</td><td>{{ $r['tables'] }}</td><td>{{ $r['launches'] }}</td></tr>@empty<tr><td colspan="3">بدون داده</td></tr>@endforelse
</tbody></table>
<table><thead><tr><th>شعبه</th><th>میز</th><th>ورود</th></tr></thead><tbody>
@forelse($bi['qr']['tables'] as $r)<tr><td>{{ $r['branch'] }}</td><td>{{ $r['table'] }}</td><td>{{ $r['launches'] }}</td></tr>@empty<tr><td colspan="3">بدون داده</td></tr>@endforelse
</tbody></table>
<a href="{{ route('cashier.tables') }}">مدیریت میزها</a>
</section>
<section class="panel">
<h2>اقتصاد تخفیف ساعات خلوت</h2>
<p class="muted">گروه پیشنهادهای همان دوره و مصرف پیش از انتهای دوره؛ رزرو سقف بودجه هزینه واقعی نیست و افزایش علّی فروش را نشان نمی‌دهد.</p>
<table><thead><tr><th>شعبه/ارز</th><th>پیشنهاد</th><th>ظرفیت</th><th>دریافت</th><th>مصرف</th><th>نرخ مصرف</th><th>سقف رزرو</th><th>ناخالص</th><th>تخفیف</th><th>خالص</th></tr></thead><tbody>
@forelse($bi['quiet_hours'] as $m)<tr><td>{{ $m['branch'] }} / {{ $m['currency'] }}</td>
@foreach(['offers','capacity','claimed','redeemed'] as $key)<td>{{ $m[$key] }}</td>@endforeach
<td>{{ $m['redemption_percent']===null?'—':$m['redemption_percent'].'٪' }}</td>
@foreach(['reserved_minor','gross_minor','discount_minor','net_minor'] as $key)<td>{{ number_format($m[$key]) }}</td>@endforeach
</tr>@empty<tr><td colspan="10">بدون پیشنهاد</td></tr>@endforelse
</tbody></table>
<a href="{{ route('cashier.quiet-hours') }}">مدیریت پیشنهادها</a>
</section>
<section class="panel">
<h2>اقتصاد کمپین‌های هفتگی</h2>
<p class="muted">ارقام زنده تمام عمر کمپین‌هایی که با بازه همپوشانی دارند؛ شامل مسیر تاریخی آنلاین. ROI سناریو تخمین است؛ ROI ثبت‌شده به اندازه‌گیری مستند اپراتور متکی است، نه تأیید مستقل.</p>
@if($bi['campaigns_lifetime_live']['status']==='incomplete')<p role="alert">تنها ۳۰ کمپین آخر نمایش داده می‌شوند.</p>@endif
<table><thead><tr><th>هفته/ارز</th><th>وضعیت مالی</th><th>صادرشده</th><th>مصرف</th><th>بودجه</th><th>تعهد صدور</th><th>تعهد باز</th><th>ROI سناریو</th><th>ROI ثبت‌شده</th></tr></thead><tbody>
@forelse($bi['campaigns_lifetime_live']['rows'] as $r)<tr><td>{{ $r['period'] }} / {{ $r['currency']??'—' }}</td><td>{{ ['operator_measured'=>'اندازه‌گیری ثبت‌شده','scenario_only'=>'فقط سناریو','no_approved_plan'=>'بدون طرح مصوب','invalid_or_unavailable'=>'داده نامعتبر','unavailable'=>'نامشخص'][$r['financial_status']]??'نامشخص' }}</td>
@foreach(['issued','redeemed_all_channels','budget_minor','committed_minor','outstanding_minor'] as $key)<td>{{ $r[$key]===null?'—':number_format($r[$key]) }}</td>@endforeach
@foreach(['assumption_roi_percent','recorded_roi_percent'] as $key)<td>{{ $r[$key]===null?'—':$r[$key].'٪' }}</td>@endforeach
</tr>@empty<tr><td colspan="9">بدون کمپین</td></tr>@endforelse
</tbody></table>
</section>
<section class="panel">
<h2>روند هفت‌روزه فعالیت تجاری</h2>
<table><thead><tr><th>شروع</th><th>پایان انحصاری</th><th>ورود QR</th><th>ارز؛ رسید؛ خالص</th></tr></thead><tbody>
@foreach($bi['commercial_trend'] as $r)<tr><td>{{ $r['from'] }}</td><td>{{ $r['until_exclusive'] }}</td><td>{{ $r['qr_launches'] }}</td><td>@forelse($r['receipts'] as $m)<p>{{ $m['currency'] }} · {{ $m['receipts'] }} · {{ number_format($m['net_minor']) }}</p>@empty — @endforelse</td></tr>@endforeach
</tbody></table>
<p class="muted">داده‌های دوره ناقص امروز کنار گذاشته شده‌اند؛ ارقام زنده به‌طور جداگانه مشخص شده‌اند. همه خروجی‌ها محرمانه و صرفاً برای سوپرادمین هستند.</p>
</section>
