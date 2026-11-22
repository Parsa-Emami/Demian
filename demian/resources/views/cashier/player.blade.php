@extends('cashier.layout')
@section('title', 'پروندهٔ بازیکن | دمیان')
@section('content')
<h1>{{ $player->display_name }}</h1>
<a class="button secondary" href="{{ route('cashier.players') }}">فهرست بازیکنان</a>
@if($contact !== null)
<p>راه ارتباطی ثبت‌شده: <bdi>{{ $contact }}</bdi></p>
@elseif($staff->role === 'super_admin')
<p>راه ارتباطی ثبت نشده است.</p>
@endif
@php($states = ['issued' => 'قابل استفاده', 'redeemed' => 'مصرف شده', 'expired' => 'منقضی شده', 'revoked' => 'باطل شده', 'reserved' => 'رزرو شده'])
<h2>سوابق کوپن</h2>
<table aria-label="سوابق کوپن بازیکن">
<thead><tr><th scope="col">شناسه</th><th scope="col">نوع</th><th scope="col">تخفیف</th><th scope="col">اعتبار تا</th><th scope="col">وضعیت</th></tr></thead>
<tbody>
@forelse($coupons as $coupon)
@php($state = $coupon->status === 'issued' && \Carbon\CarbonImmutable::parse($coupon->expires_at, 'UTC')->isPast() ? 'expired' : $coupon->status)
<tr><td>{{ $coupon->id }}</td><td>{{ $coupon->source === 'gift' ? 'هدیه' : 'جایزهٔ هفتگی' }} @if($coupon->game_id) · {{ $coupon->game_id }} @endif</td>
<td>{{ $coupon->discount_percent }}٪</td><td>{{ \Carbon\CarbonImmutable::parse($coupon->expires_at, 'UTC')->setTimezone('Asia/Tehran')->format('Y/m/d H:i') }}</td>
<td>{{ $states[$state] ?? 'در انتظار بررسی' }}</td></tr>
@empty
<tr><td colspan="5">کوپنی برای این بازیکن ثبت نشده است.</td></tr>
@endforelse
</tbody>
</table>
<nav class="row" aria-label="صفحه‌های سوابق">
@if($coupons->previousPageUrl()) <a class="button secondary" href="{{ $coupons->previousPageUrl() }}">قبلی</a> @endif
@if($coupons->nextPageUrl()) <a class="button secondary" href="{{ $coupons->nextPageUrl() }}">بعدی</a> @endif
</nav>
@endsection
