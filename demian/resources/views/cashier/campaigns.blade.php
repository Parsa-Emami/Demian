@extends('cashier.layout')
@section('title', 'کمپین جوایز و موجودی | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<h1>کمپین جوایز و بانک کد تخفیف</h1>
<p class="muted">فقط سوپرادمین. کد خام هرگز در گزارش‌ها نشان داده نمی‌شود. کد تخصیص‌یافته فقط در کیف جوایز دریافت‌کننده قابل مشاهده است.</p>
@if(session('notice'))<div class="ok" role="status">{{ session('notice') }}</div>@endif
@if($errors->any())<div class="alert" role="alert">{{ $errors->first() }}</div>@endif
@php($financialLabels = ['budget_minor' => 'بودجه سقف تعهد تخفیف هفته', 'cost_ceiling_bps' => 'سقف هزینه متغیر سفارش (واحد ۱/۱۰۰ درصد)', 'margin_floor_bps' => 'حداقل حاشیه مشارکت پس از تخفیف (واحد ۱/۱۰۰ درصد)', 'incremental_share_bps' => 'فرض سهم خریدهای افزایشی (واحد ۱/۱۰۰ درصد)', 'planned_operating_minor' => 'هزینه عملیاتی پیش‌بینی‌شده کمپین'])
<section class="panel">
<h2>۱. ایجاد کمپین هفته آینده</h2>
<p class="muted">سیاست مصوب: {{ $policy['currency'] }}؛ حداقل خرید {{ number_format($policy['min_order_minor']) }}؛ حداکثر تخفیف {{ number_format($policy['max_discount_minor']) }}؛ اعتبار ۱۴ روز از اعلام نتیجه. سقف درصدها: ۳۰، ۲۰، ۲۰، ۱۰.</p>
@if($weeks)
<form method="post" action="{{ route('cashier.campaigns.create') }}" autocomplete="off">
@csrf
<label for="period_key">هفته</label>
<select id="period_key" name="period_key" required>
@foreach($weeks as $week)<option value="{{ $week }}">{{ $week }}</option>@endforeach
</select>
<label for="title">نام کمپین</label>
<input id="title" name="title" minlength="3" maxlength="100" value="{{ old('title', 'جوایز هفتگی دمیان') }}" required>
<label for="max_awards">حداکثر جوایز (۱ تا ۲۰۰)</label>
<input id="max_awards" name="max_awards" type="number" min="1" max="200" value="{{ old('max_awards', 10) }}" required>
<label for="min_order_minor">حداقل خرید</label>
<input id="min_order_minor" name="min_order_minor" type="number" min="{{ $policy['min_order_minor'] }}" max="1000000000000" value="{{ old('min_order_minor', $policy['min_order_minor']) }}" required>
<label for="max_discount_minor">سقف مبلغ تخفیف</label>
<input id="max_discount_minor" name="max_discount_minor" type="number" min="1" max="{{ $policy['max_discount_minor'] }}" value="{{ old('max_discount_minor', $policy['max_discount_minor']) }}" required>

@foreach(['percent_first' => 1, 'percent_second' => 2, 'percent_third' => 3, 'percent_other' => 4] as $field => $rank)
<label for="{{ $field }}">درصد رتبه {{ $rank === 4 ? 'چهارم تا دهم' : $rank }} (سقف {{ $policy['ranks'][$rank] }})</label>
<input id="{{ $field }}" name="{{ $field }}" type="number" min="1" max="{{ $policy['ranks'][$rank] }}" value="{{ old($field, $recommendedRates[$rank]) }}" required>
@endforeach
<h3>برنامه مالی هفته</h3>
<p class="muted">همه مبالغ در واحد پول مصوب است. هر ۱۰۰ واحد bps برابر ۱٪ است؛ مثال ۵۰۰۰ برابر ۵۰٪. اعداد باید از حسابداری و سناریوی مصوب وارد شوند، نه تخمین خودکار سامانه.</p>
@foreach($economicsFields as $field => [$min, $max])
<label for="{{ $field }}">{{ $financialLabels[$field] }}</label>
<input id="{{ $field }}" name="{{ $field }}" type="number" min="{{ $min }}" max="{{ $max }}" value="{{ old($field) }}" required>
@endforeach
<label>رمز سوپرادمین</label>
<input name="password" type="password" required autocomplete="current-password">
<label class="check"><input type="checkbox" name="confirmed" value="1" required><span>تعهد جوایز و شرایط تخفیف را تأیید می‌کنم.</span></label>
<button type="submit">ایجاد پیش‌نویس</button>
</form>
@else
<p class="muted">هفته آینده آماده نیست یا کمپین آن قبلاً ایجاد شده است. ابتدا آماده‌سازی هفته‌ها را اجرا کنید.</p>
@endif
</section>
<section class="panel">
<h2>۲. موجودی و مدیریت کمپین‌ها</h2>
@forelse($campaigns as $campaign)
<article class="panel">
<h3>#{{ $campaign['id'] }} · {{ $campaign['title'] }}</h3>
<p>{{ $campaign['period_key'] }} · {{ $campaign['status'] }} · سقف جوایز: {{ $campaign['max_awards'] }}</p>
<p class="muted">موجود: {{ $campaign['available'] }} · تخصیص‌یافته: {{ $campaign['assigned'] }} · باطل‌شده: {{ $campaign['void'] }}</p>
<p class="muted">درصد رتبه‌ها: {{ $campaign['terms']['ranks'][1] }} / {{ $campaign['terms']['ranks'][2] }} / {{ $campaign['terms']['ranks'][3] }} / {{ $campaign['terms']['ranks'][4] }}</p>
<p class="muted">شناسه‌های موجودی آزاد برای ابطال: {{ implode('، ', $campaign['available_ids']) ?: '—' }} (حداکثر ۱۵ شناسه)</p>
@php($finance = $campaign['finance'])
<h4>گزارش مالی کمپین ({{ $campaign['terms']['currency'] }})</h4>
<table><tbody>
@foreach(['issued_count' => 'کوپن صادرشده', 'redeemed_count' => 'کوپن مصرف‌شده', 'committed_minor' => 'کل تعهد سقف تخفیف صادرشده', 'outstanding_minor' => 'تعهد باز فعلی', 'budget_remaining_minor' => 'بودجه تخصیص‌نیافته', 'gross_minor' => 'فروش ناخالص فاکتورهای دارای کوپن', 'discount_minor' => 'تخفیف واقعی ثبت‌شده', 'net_sales_minor' => 'فروش پس از تخفیف', 'redemption_percent' => 'نرخ مصرف کوپن (%)'] as $field => $label)
<tr><th>{{ $label }}</th><td>{{ $finance[$field] === null ? '—' : number_format($finance[$field], $field === 'redemption_percent' ? 2 : 0) }}</td></tr>
@endforeach
</tbody></table>
@if($finance['economics'])
<p>بودجه مصوب: {{ number_format($finance['economics']['budget_minor']) }} · سقف هزینه متغیر {{ $finance['economics']['cost_ceiling_bps'] / 100 }}٪ · کف حاشیه مشارکت {{ $finance['economics']['margin_floor_bps'] / 100 }}٪</p>
<p>حداکثر تعهد وعده‌داده‌شده: {{ number_format($finance['projection']['maximum_liability_minor']) }} · خالص افزایشی پیش‌بینی‌شده در سناریوی کل جوایز و حداقل فاکتور: {{ number_format($finance['projection']['net_incremental_minor']) }}</p>
<p class="muted">سناریوی محافظه‌کارانه با فرض سهم افزایشی {{ $finance['economics']['incremental_share_bps'] / 100 }}٪؛ هزینه واقعی کالا یا افزایش فروش اثبات نشده است.</p>
<table><tbody>
@foreach(['estimated_variable_cost_minor' => 'هزینه متغیر برآوردی', 'estimated_coupon_order_contribution_minor' => 'مشارکت برآوردی فاکتورهای کوپن', 'assumed_incremental_contribution_minor' => 'مشارکت افزایشی فرضی', 'net_incremental_minor' => 'خالص افزایشی برآوردی', 'roi_percent' => 'ROI سناریویی (%)', 'break_even_share_percent' => 'حداقل سهم خرید افزایشی برای سربه‌سر (%)'] as $field => $label)
<tr><th>{{ $label }}</th><td>{{ $finance['scenario'][$field] === null ? '—' : number_format($finance['scenario'][$field], str_ends_with($field, 'percent') ? 2 : 0) }}</td></tr>
@endforeach
</tbody></table>
@else
<p class="alert">کمپین تاریخی بدون برنامه مالی مصوب؛ صدور جدید در محیط واقعی مجاز نیست.</p>
@endif
@if($finance['measurement'])
<p>ROI مستند اعلام‌شده: {{ $finance['measurement']['roi_percent'] === null ? 'تعریف‌نشده' : number_format($finance['measurement']['roi_percent'], 2).'٪' }} · سود افزایشی خالص: {{ number_format($finance['measurement']['net_incremental_minor']) }} · مرجع: {{ $finance['measurement']['evidence_ref'] }} · {{ $finance['measurement']['recorded_at'] }}</p>
@else
<p class="muted">ROI واقعی تا دریافت داده ممیزی‌شده مقایسه با گروه کنترل مشخص نیست.</p>
@endif
@if($campaign['status'] === 'closed' && $finance['outstanding_count'] === 0)
<form method="post" action="{{ route('cashier.campaigns.measure', ['campaignId' => $campaign['id']]) }}" autocomplete="off">
@csrf
<h4>ثبت اندازه‌گیری مستند پس از تسویه</h4>
<p class="muted">مشارکت افزایشی پیش از تخفیف را از حسابداری و مقایسه با گروه کنترل وارد کنید؛ داده شخصی یا متن رسید وارد نشود. ثبت جدید، سوابق قبلی را حذف نمی‌کند.</p>
<label>شناسه گزارش حسابداری یا آزمایش کنترل‌شده</label><input name="evidence_ref" maxlength="80" required>
<label>مشارکت افزایشی پیش از تخفیف (مجاز به مقدار منفی)</label><input name="incremental_contribution_minor" type="number" min="-200000000000000" max="200000000000000" required>
<label>هزینه عملیاتی واقعی کمپین</label><input name="operating_minor" type="number" min="0" max="200000000000000" required>
<label>رمز سوپرادمین</label><input name="password" type="password" required autocomplete="current-password">
<label class="check"><input type="checkbox" name="confirmed" value="1" required><span>داده‌های مالی مستند و روش انتساب فروش را تأیید می‌کنم.</span></label>
<button type="submit">ثبت ROI مستند</button>
</form>
@endif
@if($campaign['allocation'])
@php($allocation = $campaign['allocation'])
<h4>سهمیه پویای برندگان · {{ $allocation['status'] === 'sealed' ? 'نهایی و قفل‌شده' : 'پیش‌نمایش موقت' }}</h4>
@if(($allocation['identity_policy'] ?? null) === 'verified-phone-weekly-v1')<p class="muted">فقط حساب دارای شماره تأییدشده در مشارکت مالی و سهمیه جایزه محاسبه می‌شود؛ رتبه فنی دیگر حساب‌ها محفوظ است.</p>@endif
<p class="muted">حداقل ۲۰ مشارکت معتبر در هر بازی؛ هدف ۱۵٪ تا سقف سهمیه بازی، بودجه و یک جایزه برای هر حساب. نرخ دریافت جایزه نسبت آماری است، نه احتمال تضمین‌شده.</p>
<p>مشارکت‌کنندگان یکتا: {{ $allocation['participants'] }} · واجد شرایط: {{ $allocation['eligible'] }} · ظرفیت مالی: {{ $allocation['funded_capacity'] }} · برندگان: {{ $allocation['winner_count'] }} · نرخ: {{ $allocation['award_rate_bps'] === null ? '—' : number_format($allocation['award_rate_bps'] / 100, 2).'٪' }}</p>
<p>حداکثر تعهد برندگان: {{ number_format($allocation['maximum_commitment_minor']) }} · ظرفیت تخصیص‌نیافته: {{ $allocation['unallocated_capacity'] }}</p>
@if($allocation['status'] !== 'sealed' && !$allocation['ready'])<p class="alert">کمپین فعال نیست یا موجودی کد کافی نیست؛ پیش‌نمایش مجوز صدور نیست.</p>@endif
<table><thead><tr><th>بازی</th><th>مشارکت</th><th>واجد شرایط</th><th>هدف</th><th>سهمیه</th><th>برندگان</th><th>نرخ</th></tr></thead><tbody>
@foreach($allocation['games'] as $game => $row)
<tr><td>{{ $game }}</td><td>{{ $row['participants'] }}</td><td>{{ $row['eligible'] }}</td><td>{{ $row['target'] }}</td><td>{{ $row['quota'] }}</td><td>{{ $row['winners'] }}</td><td>{{ $row['award_rate_bps'] === null ? '—' : number_format($row['award_rate_bps'] / 100, 2).'٪' }}</td></tr>
@endforeach
</tbody></table>
@else
<p class="muted">کمپین بدون سیاست پویای نسخه‌دار (سابقه یا پیش‌نویس قدیمی).</p>
@endif
<h4>برندگان تأییدشده و وضعیت تحویل</h4>
<table><thead><tr><th>بازی</th><th>رتبه</th><th>شناسه کوتاه بازیکن</th><th>وضعیت کد</th></tr></thead><tbody>
@forelse($campaign['winners'] as $winner)
<tr><td>{{ $winner['game'] }}</td><td>{{ $winner['rank'] }}</td><td>{{ $winner['player'] }}</td><td>{{ $winner['coupon_status'] }}</td></tr>
@empty
<tr><td colspan="4">هنوز برندگان این هفته نهایی نشده‌اند.</td></tr>
@endforelse
</tbody></table>
@if(in_array($campaign['status'], ['draft','active','paused'], true))
<form method="post" action="{{ route('cashier.campaigns.import', ['campaignId' => $campaign['id']]) }}" autocomplete="off">
@csrf
<input type="hidden" name="request_key" value="{{ $batchKeys[$campaign['id']] }}">
<label for="codes_{{ $campaign['id'] }}">کدهای آماده، هر خط یک کد (حداکثر ۲۰۰)</label>
<textarea name="codes" id="codes_{{ $campaign['id'] }}" rows="3" maxlength="8192" required></textarea>
<label>رمز سوپرادمین</label>
<input name="password" type="password" required autocomplete="current-password">
<label class="check"><input type="checkbox" name="confirmed" value="1" required><span>کدهای آماده برای این کمپین معتبرند.</span></label>
<button type="submit">ورود کدهای آماده</button>
</form>
@endif
@if($campaign['status'] === 'draft')
<form method="post" action="{{ route('cashier.campaigns.revise', ['campaignId' => $campaign['id']]) }}" autocomplete="off">
@csrf
<h4>ویرایش شرایط پیش‌نویس</h4>
<label>نام</label><input name="title" minlength="3" maxlength="100" value="{{ $campaign['title'] }}" required>
<label>حداکثر جوایز</label><input name="max_awards" type="number" min="1" max="200" value="{{ $campaign['max_awards'] }}" required>
<label>حداقل خرید</label><input name="min_order_minor" type="number" min="{{ $policy['min_order_minor'] }}" value="{{ $campaign['terms']['min_order_minor'] }}" required>
<label>سقف تخفیف</label><input name="max_discount_minor" type="number" min="1" max="{{ $policy['max_discount_minor'] }}" value="{{ $campaign['terms']['max_discount_minor'] }}" required>

@foreach(['percent_first' => 1, 'percent_second' => 2, 'percent_third' => 3, 'percent_other' => 4] as $field => $rank)
<label>درصد رتبه {{ $rank }}</label>
<input name="{{ $field }}" type="number" min="1" max="{{ $policy['ranks'][$rank] }}" value="{{ $campaign['terms']['ranks'][$rank] }}" required>
@endforeach
@foreach($economicsFields as $field => [$min, $max])
<label>{{ $financialLabels[$field] }}</label><input name="{{ $field }}" type="number" min="{{ $min }}" max="{{ $max }}" value="{{ $campaign['finance']['economics'][$field] ?? '' }}" required>
@endforeach
<label>رمز سوپرادمین</label><input name="password" type="password" required autocomplete="current-password">
<label class="check"><input type="checkbox" name="confirmed" value="1" required><span>اصلاح شرایط را تأیید می‌کنم.</span></label>
<button type="submit">ثبت تغییرات پیش‌نویس</button>
</form>
@endif
@foreach(['activate' => 'فعال‌سازی', 'pause' => 'توقف صدور', 'close' => 'بستن دائمی'] as $action => $label)
@if(($action === 'activate' && in_array($campaign['status'], ['draft','paused'], true))
    || ($action === 'pause' && $campaign['status'] === 'active')
    || ($action === 'close' && $campaign['status'] !== 'closed'))
<form method="post" action="{{ route('cashier.campaigns.transition', ['campaignId' => $campaign['id'], 'action' => $action]) }}" autocomplete="off">
@csrf
<label>رمز سوپرادمین برای {{ $label }}</label>
<input name="password" type="password" required autocomplete="current-password">
<label class="check"><input type="checkbox" name="confirmed" value="1" required><span>{{ $label }} را تأیید می‌کنم.</span></label>
<button type="submit">{{ $label }}</button>
</form>
@endif
@endforeach
</article>
@empty
<p class="muted">هنوز کمپینی ثبت نشده است.</p>
@endforelse
</section>
<section class="panel">
<h2>۳. ابطال کد تخصیص‌نیافته</h2>
<p class="muted">شناسه داخلی موجودی را از گزارش عملیاتی امن دریافت کنید؛ کد خام وارد نکنید.</p>
<form method="post" action="{{ route('cashier.campaigns.void') }}" autocomplete="off">
@csrf
<label for="inventory_id">شناسه موجودی</label>
<input id="inventory_id" name="inventory_id" type="number" min="1" required>
<label>رمز سوپرادمین</label><input name="password" type="password" required autocomplete="current-password">
<label class="check"><input type="checkbox" name="confirmed" value="1" required><span>ابطال دائمی را تأیید می‌کنم.</span></label>
<button type="submit">ابطال موجودی آزاد</button>
</form>
</section>
<section class="panel">
<h2>۴. آخرین عملیات</h2>
<table><thead><tr><th>ردیف</th><th>کمپین</th><th>عملیات</th><th>زمان</th></tr></thead><tbody>
@forelse($events as $event)
<tr><td>{{ $event->id }}</td><td>{{ $event->campaign_id }}</td><td>{{ $event->event_type }}</td><td>{{ $event->created_at }}</td></tr>
@empty
<tr><td colspan="4">رویدادی ثبت نشده است.</td></tr>
@endforelse
</tbody></table>
</section>
@endsection
