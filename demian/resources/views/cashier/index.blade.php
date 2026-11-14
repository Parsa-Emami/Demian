@extends('cashier.layout')
@section('title', 'بررسی کد تخفیف | دمیان')
@section('content')
<h1>اعتبارسنجی حضوری کد تخفیف</h1>
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
@if ($staff->role === 'manager')
<p><a class="button secondary" href="{{ route('cashier.report') }}">گزارش مصرف شعبه</a></p>
@endif
@endsection
