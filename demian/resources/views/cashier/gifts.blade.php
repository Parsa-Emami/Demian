@extends('cashier.layout')
@section('title', 'هدیه اختصاصی بازیکن | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<h1>مدیریت هدایا و کدهای اختصاصی</h1>
<p class="muted">فقط سوپرادمین مجاز به صدور هدیه است. هدایا از جایزه هفتگی مستقل‌اند و در کیف جوایز بازیکن نمایش داده می‌شوند. مشاهده این صفحه یا جست‌وجو هیچ کدی صادر نمی‌کند.</p>
@if (session('notice'))<div class="ok" role="status">{{ session('notice') }}</div>@endif
@if ($errors->any())<div class="alert" role="alert">{{ $errors->first() }}</div>@endif
<section class="panel">
<h2>۱. جست‌وجوی دریافت‌کننده</h2>
<form method="get" action="{{ route('cashier.gifts') }}">
<label for="q">نام نمایشی بازیکن یا شناسه کامل حساب</label>
<input id="q" name="q" value="{{ $query }}" maxlength="60" required minlength="2" autocomplete="off">
<p><button type="submit">جست‌وجوی بازیکن</button></p>
</form>
</section>
<section class="panel">
<h2>۲. صدور کد هدیه یک‌بارمصرف</h2>
<p class="muted">واحد پول: {{ $terms['currency'] }} · حداکثر درصد: {{ $terms['gift_max_percent'] }}٪ · حداکثر مدت: {{ $terms['gift_max_valid_days'] }} روز · سقف تخفیف مجاز: {{ number_format($terms['max_discount_minor']) }}</p>
@if ($players)
<form method="post" action="{{ route('cashier.gifts.issue') }}" autocomplete="off">
@csrf
<input type="hidden" name="request_key" value="{{ $requestKey }}">
<label for="player_id">بازیکن دریافت‌کننده</label>
<select name="player_id" id="player_id" required style="min-height:48px;width:100%;background:#0e191b;color:#fff">
@foreach($players as $player)
<option value="{{ $player['id'] }}">{{ $player['name'] }} ({{ $player['id'] }})</option>
@endforeach
</select>
<label for="percent">درصد تخفیف (۱ تا {{ $terms['gift_max_percent'] }})</label>
<input id="percent" name="percent" type="number" min="1" max="{{ $terms['gift_max_percent'] }}" value="10" required>
<label for="min_order_minor">حداقل فاکتور ({{ $terms['currency'] }}، واحد خرد)</label>
<input id="min_order_minor" name="min_order_minor" type="number" min="{{ $terms['min_order_minor'] }}" value="{{ $terms['min_order_minor'] }}" step="1" required>
<label for="max_discount_minor">سقف مبلغ تخفیف ({{ $terms['currency'] }}، واحد خرد)</label>
<input id="max_discount_minor" name="max_discount_minor" type="number" min="1" max="{{ $terms['max_discount_minor'] }}" value="{{ $terms['max_discount_minor'] }}" step="1" required>
<label for="valid_days">مهلت استفاده (روز)</label>
<input id="valid_days" name="valid_days" type="number" min="1" max="{{ $terms['gift_max_valid_days'] }}" value="{{ $terms['gift_max_valid_days'] }}" step="1" required>
<label for="reason">دلیل هدیه</label>
<select id="reason" name="reason" required style="min-height:48px;width:100%;background:#0e191b;color:#fff">
<option value="birthday">تولد</option><option value="compensation">جبران مشکل</option>
<option value="vip">مهمان ویژه</option><option value="campaign">کمپین</option>
<option value="other">سایر</option>
</select>
<label for="reason_note">یادداشت کوتاه (اختیاری، بدون اطلاعات حساس)</label>
<input id="reason_note" name="reason_note" maxlength="200" autocomplete="off">
<label for="gift_password">تأیید مجدد رمز سوپرادمین</label>
<input id="gift_password" type="password" name="password" required autocomplete="current-password">
<label class="check">
<input type="checkbox" name="confirmed" value="1" required>
<span>درصد، سقف مبلغ، بازیکن و دلیل هدیه را بررسی کرده‌ام و صدور قطعی را تأیید می‌کنم.</span>
</label>
<button type="submit">صدور هدیه برای بازیکن</button>
</form>
@else
<p class="muted">برای صدور هدیه ابتدا نام بازیکن را جست‌وجو کنید. اگر نتیجه‌ای یافت نشد، نام یا شناسه دقیق حساب را بررسی کنید.</p>
@endif
</section>
<section class="panel">
<h2>۳. تاریخچه ۵۰ هدیه اخیر</h2>
<p class="muted">کد خام و اطلاعات ورود بازیکنان عمداً نمایش داده نمی‌شوند. ابطال کدهای استفاده‌نشده فقط از بخش ابطال امن در داشبورد سوپرادمین انجام می‌شود.</p>
<table>
<thead><tr><th>هدیه</th><th>بازیکن</th><th>صادرکننده</th><th>دلیل</th><th>درصد</th><th>وضعیت</th><th>تاریخ</th></tr></thead>
<tbody>
@forelse($gifts as $gift)
<tr><td>#{{ $gift['gift_id'] }}</td><td>{{ $gift['recipient'] }}</td>
<td>{{ $gift['issuer'] }}</td><td>{{ $gift['reason'] }}</td>
<td>{{ $gift['percent'] }}٪</td><td>{{ $gift['status'] }}</td>
<td>{{ $gift['created_at'] }}</td></tr>
@empty
<tr><td colspan="7">هنوز هدیه‌ای صادر نشده است.</td></tr>
@endforelse
</tbody></table>
</section>
@endsection
