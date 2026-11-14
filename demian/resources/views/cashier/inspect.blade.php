@extends('cashier.layout')
@section('title', 'نتیجه بررسی تخفیف | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a><span class="pill">چهار رقم آخر: {{ $details['code_suffix'] }}</span></div>
<section class="panel">
<h1>وضعیت اعتبار کد</h1>
@if ($details['state'] === 'valid')
  <div class="ok" role="status">کد معتبر است؛ هنوز مصرف نشده است.</div>
@else
  <div class="alert" role="alert">
    @switch($details['state'])
      @case('redeemed') این کد قبلاً مصرف شده است. @break
      @case('expired') مهلت استفاده از کد به پایان رسیده است. @break
      @case('revoked') این کد لغو شده است. @break
      @default کد در حال حاضر قابل استفاده نیست.
    @endswitch
  </div>
@endif
<div class="big">{{ $details['percent'] }}٪ تخفیف</div>
<div class="cards">
  <div class="card">واحد پولی<strong>{{ $details['currency'] }}</strong></div>
  <div class="card">حداقل خرید<strong>{{ number_format($details['minimum_minor']) }}</strong></div>
  <div class="card">سقف تخفیف<strong>{{ number_format($details['cap_minor']) }}</strong></div>
  <div class="card">انقضای کد (UTC)<strong>{{ $details['expires_at'] }}</strong></div>
</div>
@if ($details['state'] === 'valid')
<hr style="border:0;border-top:1px solid #415557;margin:28px 0">
<h2>تأیید نهایی مصرف حضوری</h2>
<p class="muted">بعد از بررسی سفارش در صندوق، شماره فاکتور داخلی و مبلغ قبل از تخفیف را ثبت کنید. این عملیات برگشت‌ناپذیر است؛ فقط پس از نهایی‌شدن خرید تأیید کنید.</p>
<form method="post" action="{{ route('cashier.redeem') }}" autocomplete="off">
@csrf
<input type="hidden" name="code" value="{{ $code }}">
<input type="hidden" name="request_key" value="{{ $requestKey }}">
<label for="ticket">شماره فاکتور صندوق (بدون اطلاعات شخصی)</label>
<input id="ticket" name="ticket_ref" required maxlength="64" placeholder="TICKET-2026-001" spellcheck="false">
<label for="subtotal">مبلغ فاکتور پیش از تخفیف ({{ $details['currency'] }} در کوچک‌ترین واحد)</label>
<input id="subtotal" type="number" name="subtotal_minor" required min="1" max="1000000000000" step="1">
<label class="check"><input type="checkbox" name="confirmed" value="1" required>
<span>خرید را در صندوق بررسی کرده‌ام و تأیید می‌کنم کد یک‌بار مصرف شود.</span></label>
<button type="submit">ثبت قطعی مصرف کد</button>
</form>
@endif
</section>
@endsection
