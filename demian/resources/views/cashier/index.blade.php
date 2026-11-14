@extends('cashier.layout')
@section('title', 'بررسی کد تخفیف | دمیان')
@section('content')
<h1>داشبورد کافه</h1>
<p class="pill">نقش: {{ $staff->role }} · {{ count($permissions) }} از ۱۰ مجوز</p>
@if (session('notice'))<div class="ok" role="status">{{ session('notice') }}</div>@endif
<div class="row">
@if (in_array('report.branch', $permissions, true))
  <a class="button secondary" href="{{ route('cashier.report') }}">گزارش شعبه</a>
@endif
@if (in_array('staff.directory', $permissions, true))
  <a class="button secondary" href="{{ route('cashier.staff') }}">فهرست کارکنان</a>
@endif
@if (in_array('report.global', $permissions, true))
  <a class="button secondary" href="{{ route('cashier.report.global') }}">گزارش همه شعب</a>
@endif
@if ($staff->role === 'super_admin')
  <a class="button secondary" href="{{ route('cashier.gifts') }}">اهدای کد تخفیف به بازیکن</a>
@endif
@if (in_array('audit.ledger', $permissions, true))
  <a class="button secondary" href="{{ route('cashier.audit') }}">ممیزی جوایز</a>
@endif
@if (in_array('operations.readiness', $permissions, true))
  <a class="button secondary" href="{{ route('cashier.readiness') }}">آمادگی انتشار</a>
@endif
</div>
<h2>اعتبارسنجی حضوری کد تخفیف</h2>
<p class="muted">کد مشتری را وارد کنید. مشاهده و بررسی کد به معنای مصرف آن نیست.</p>
@if ($errors->any())<div class="alert" role="alert">{{ $errors->first() }}</div>@endif
@if (session('receipt'))
@php($receipt = session('receipt'))
<div class="ok" role="status">
  <h2>مصرف کد با موفقیت ثبت شد</h2>
  <p>شماره رسید ثبت: <strong>{{ $receipt['receipt_id'] }}</strong></p>
  <p>تخفیف اعمال‌شده: <strong>{{ number_format($receipt['discount_minor']) }} {{ $receipt['currency'] }}</strong></p>
  <p>مبلغ سفارش: {{ number_format($receipt['subtotal_minor']) }} {{ $receipt['currency'] }}</p>
  @if ($receipt['idempotent_replay'])<p>این درخواست قبلاً ثبت شده بود؛ مصرف جدیدی ایجاد نشد.</p>@endif
</div>
@endif
<section class="panel">
<form method="post" action="{{ route('cashier.lookup') }}" autocomplete="off">
@csrf
<label for="code">کد نمایش‌داده‌شده توسط بازیکن</label>
<input id="code" name="code" inputmode="text" maxlength="36" required
 placeholder="DMC-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" spellcheck="false" autocapitalize="characters">
<p><button type="submit">بررسی کد، بدون ثبت مصرف</button></p>
</form>
</section>
@if (in_array('coupon.revoke', $permissions, true))
<section class="panel">
<h2>ابطال اضطراری کد (فقط سوپرادمین)</h2>
<p class="muted">این عملیات تنها روی کد مصرف‌نشده مجاز است؛ برای جلوگیری از اقدام تصادفی، رمز عبور و تأیید مجدد لازم است.</p>
<form method="post" action="{{ route('cashier.coupons.revoke') }}" autocomplete="off">
@csrf
<label for="coupon_id">شناسه داخلی کوپن</label>
<input id="coupon_id" type="number" name="coupon_id" required min="1" step="1">
<label for="reason">علت</label>
<select id="reason" name="reason" required style="min-height:46px">
  <option value="incident">رخداد امنیتی</option>
  <option value="fraud">سوءاستفاده</option>
  <option value="policy">مغایرت با قوانین تخفیف</option>
</select>
<label for="admin_password">تأیید رمز عبور سوپرادمین</label>
<input id="admin_password" type="password" name="password" required autocomplete="current-password">
<label class="check"><input type="checkbox" name="confirmed" value="1" required>
<span>ابطال قطعی این کد را تأیید می‌کنم.</span></label>
<button type="submit">ابطال کد</button>
</form>
</section>
@endif
@endsection
