@extends('cashier.layout')
@section('title', 'ورود صندوق‌دار | دمیان')
@section('content')
<section class="panel">
<h1>ورود صندوق‌دار</h1>
<p class="muted">فقط کارکنان مجاز کافه امکان بررسی و ثبت مصرف کدها را دارند.</p>
@if ($errors->any())<div class="alert" role="alert">{{ $errors->first() }}</div>@endif
<form method="post" action="{{ route('cashier.authenticate') }}" autocomplete="on">
@csrf
<label for="username">نام کاربری اختصاصی</label>
<input id="username" name="username" required maxlength="64" autocomplete="username" value="{{ old('username') }}" autofocus>
<label for="password">رمز عبور</label>
<input id="password" type="password" name="password" required autocomplete="current-password">
<p><button type="submit">ورود به پنل</button></p>
</form>
</section>
@endsection
