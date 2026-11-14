@extends('cashier.layout')
@section('title', 'گزارش مصرف حضوری | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<section class="panel">
<h1>تاریخچه مصرف حضوری شعبه {{ $staff->branch_id }}</h1>
<p class="muted">فقط مدیر شعبه به آخرین ۵۰ ثبت دسترسی دارد. کد بازیکنان و شماره خام فاکتورها نمایش داده نمی‌شوند.</p>
<table>
<thead><tr><th>رسید</th><th>صندوق‌دار</th><th>مبلغ سفارش</th><th>تخفیف</th><th>زمان UTC</th></tr></thead>
<tbody>
@forelse($records as $row)
<tr><td>{{ $row['id'] }}</td><td>{{ $row['cashier'] }}</td>
<td>{{ number_format((int) $row['subtotal_minor']) }} {{ $row['currency'] }}</td>
<td>{{ number_format((int) $row['discount_minor']) }}</td><td>{{ $row['redeemed_at'] }}</td></tr>
@empty
<tr><td colspan="5">هنوز تراکنش حضوری ثبت نشده است.</td></tr>
@endforelse
</tbody></table>
</section>
@endsection
