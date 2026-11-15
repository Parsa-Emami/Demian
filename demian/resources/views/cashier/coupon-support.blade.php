@extends('cashier.layout')
@section('title', 'رسیدگی به جوایز | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<h1>رسیدگی به دریافت و مصرف جوایز</h1>
<p class="muted">نمایش فقط برای سوپرادمین فعال. کد خام، توکن بازیکن و اطلاعات صندوق در این صفحه نمایش داده نمی‌شود. تصمیم جایگزینی، تنها برای کد صادرشده و مصرف‌نشده و با سیاست مالی هدیه جبرانی امکان‌پذیر است.</p>
@if(session('notice'))<div class="ok" role="status">{{ session('notice') }}</div>@endif
@if($errors->any())<div class="alert" role="alert">{{ $errors->first() }}</div>@endif

@forelse($cases as $case)
<section class="panel">
  <h2>پرونده #{{ $case->id }} — کد داخلی #{{ $case->coupon_id }}</h2>
  <p>وضعیت: <strong>{{ $case->status }}</strong> · موضوع: {{ $case->category }} · تخفیف: {{ $case->discount_percent }}٪ {{ $case->currency }}</p>
  <p class="muted">وضعیت کد: {{ $case->coupon_status }} · تاریخ انقضا (UTC): {{ $case->expires_at }} · درخواست: {{ $case->created_at }}</p>
  @if($case->description)<p>شرح بازیکن: {{ $case->description }}</p>@endif
  @if($case->status === 'open')
  <form method="post" action="{{ route('cashier.coupon-support.decide', ['caseId' => $case->id]) }}" autocomplete="off">
    @csrf
    <label for="decision-{{ $case->id }}">اقدام مجاز</label>
    <select id="decision-{{ $case->id }}" name="decision" required>
      <option value="explained">پاسخ و حل مشکل بدون تغییر کد</option>
      <option value="rejected">رد درخواست با دلیل</option>
      <option value="revoked">ابطال کد مصرف‌نشده</option>
      <option value="replaced">ابطال کد مصرف‌نشده و صدور جایگزین هم‌ارزش از مسیر هدیه جبرانی</option>
    </select>
    <label for="reason-{{ $case->id }}">توضیح مستند تصمیم (۱۰ تا ۳۰۰ نویسه)</label>
    <textarea id="reason-{{ $case->id }}" name="resolution_note" maxlength="300" minlength="10" rows="3" required></textarea>
    <label for="password-{{ $case->id }}">تأیید مجدد رمز سوپرادمین</label>
    <input id="password-{{ $case->id }}" type="password" name="password" autocomplete="current-password" required>
    <label class="check">
      <input type="checkbox" name="confirmed" value="1" required>
      <span>وضعیت مصرف، شرایط مالی و اثر نهایی تصمیم را بررسی کرده‌ام.</span>
    </label>
    <button type="submit">ثبت نهایی تصمیم</button>
  </form>
  @else
  <p>نتیجه: {{ $case->resolution }} · توضیح: {{ $case->resolution_note ?? '—' }}</p>
  @if($case->replacement_coupon_id)<p>شناسه داخلی هدیه جایگزین: #{{ $case->replacement_coupon_id }} — کد فقط در کیف دریافت‌کننده قابل مشاهده است.</p>@endif
  @endif
</section>
@empty
<section class="panel"><p>پرونده‌ای ثبت نشده است.</p></section>
@endforelse
@endsection
