@extends('cashier.layout')
@section('title', 'گزارش مصرف حضوری | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<section class="panel">
<h1>{{ $global ? 'گزارش مصرف همه شعب' : 'تاریخچه مصرف حضوری شعبه '.$staff->branch_id }}</h1>
<p class="muted">{{ $global ? 'گزارش سراسری فقط برای سوپرادمین است و ۱۰۰ ثبت اخیر را نمایش می‌دهد.' : 'فقط کارکنان مجاز شعبه به ۵۰ ثبت اخیر دسترسی دارند.' }} کد بازیکنان و شماره خام فاکتورها نمایش داده نمی‌شوند.</p>
<table>
<thead><tr><th>رسید</th>@if ($global)<th>شعبه</th>@endif<th>صندوق‌دار</th><th>مبلغ سفارش</th><th>تخفیف</th><th>زمان UTC</th></tr></thead>
<tbody>
@forelse($records as $row)
<tr><td>{{ $row['id'] }}</td>@if ($global)<td>{{ $row['branch'] }}</td>@endif<td>{{ $row['cashier'] }}</td>
<td>{{ number_format((int) $row['subtotal_minor']) }} {{ $row['currency'] }}</td>
<td>{{ number_format((int) $row['discount_minor']) }}</td><td>{{ $row['redeemed_at'] }}</td></tr>
@empty
<tr><td colspan="{{ $global ? 6 : 5 }}">هنوز تراکنش حضوری ثبت نشده است.</td></tr>
@endforelse
</tbody></table>
</section>
@endsection
