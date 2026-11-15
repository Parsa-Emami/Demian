@extends('cashier.layout')
@section('title', 'کمپین جوایز و موجودی | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<h1>کمپین جوایز و بانک کد تخفیف</h1>
<p class="muted">فقط سوپرادمین. کد خام هرگز در گزارش‌ها نشان داده نمی‌شود. کد تخصیص‌یافته فقط در کیف جوایز دریافت‌کننده قابل مشاهده است.</p>
@if(session('notice'))<div class="ok" role="status">{{ session('notice') }}</div>@endif
@if($errors->any())<div class="alert" role="alert">{{ $errors->first() }}</div>@endif
<section class="panel">
<h2>۱. ایجاد کمپین هفته آینده</h2>
<p class="muted">سیاست مصوب: {{ $policy['currency'] }}؛ حداقل خرید {{ number_format($policy['min_order_minor']) }}؛ حداکثر تخفیف {{ number_format($policy['max_discount_minor']) }}؛ اعتبار {{ $policy['valid_days'] }} روز. سقف درصدها: ۳۰، ۲۰، ۲۰، ۱۰.</p>
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
<label for="valid_days">روزهای اعتبار پس از صدور</label>
<input id="valid_days" name="valid_days" type="number" min="1" max="{{ $policy['valid_days'] }}" value="{{ old('valid_days', $policy['valid_days']) }}" required>
@foreach(['percent_first' => 1, 'percent_second' => 2, 'percent_third' => 3, 'percent_other' => 4] as $field => $rank)
<label for="{{ $field }}">درصد رتبه {{ $rank === 4 ? 'چهارم تا دهم' : $rank }} (سقف {{ $policy['ranks'][$rank] }})</label>
<input id="{{ $field }}" name="{{ $field }}" type="number" min="1" max="{{ $policy['ranks'][$rank] }}" value="{{ old($field, $policy['ranks'][$rank]) }}" required>
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
<label>روز اعتبار</label><input name="valid_days" type="number" min="1" max="{{ $policy['valid_days'] }}" value="{{ $campaign['terms']['valid_days'] }}" required>
@foreach(['percent_first' => 1, 'percent_second' => 2, 'percent_third' => 3, 'percent_other' => 4] as $field => $rank)
<label>درصد رتبه {{ $rank }}</label>
<input name="{{ $field }}" type="number" min="1" max="{{ $policy['ranks'][$rank] }}" value="{{ $campaign['terms']['ranks'][$rank] }}" required>
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
