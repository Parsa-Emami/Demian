@extends('cashier.layout')
@section('title', 'آمادگی Production | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<section class="panel">
<h1>بررسی آمادگی بهره‌برداری کافه</h1>
<div class="{{ $result['status'] === 'passed' ? 'ok' : 'alert' }}" role="status">
وضعیت: {{ $result['status'] === 'passed' ? 'کنترل‌های خودکار موفق' : 'آماده فعال‌سازی نیست' }}
</div>
<p class="muted">این بررسی فقط‌خواندنی است و جایگزین تست حضوری، بکاپ و تأیید سیاست مالی نیست.</p>
<table><thead><tr><th>کنترل</th><th>نتیجه</th></tr></thead>
<tbody>
@foreach ($result['checks'] as $check)
<tr><td>{{ $check['check'] }}</td><td>{{ $check['passed'] ? 'موفق' : 'ناموفق' }}</td></tr>
@endforeach
</tbody></table>
</section>
@endsection
