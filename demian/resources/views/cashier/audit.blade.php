@extends('cashier.layout')
@section('title', 'ممیزی جوایز | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<section class="panel">
<h1>ممیزی یکپارچگی جوایز</h1>
<div class="{{ $result['status'] === 'passed' ? 'ok' : 'alert' }}" role="status">
وضعیت ممیزی: {{ $result['status'] === 'passed' ? 'سالم' : 'نیازمند بررسی' }}
</div>
<p>تعداد کدها: {{ $result['coupons'] }} · تعداد مصارف: {{ $result['redemptions'] }}</p>
<p class="muted">در این بخش کد خام مشتری و اطلاعات پرداخت نمایش داده نمی‌شود.</p>
@if ($result['issues'])
<ul>@foreach ($result['issues'] as $issue)<li>{{ $issue }}</li>@endforeach</ul>
@endif
</section>
<section class="panel">
<h2>تاریخچه اقدامات مدیریتی اخیر</h2>
<p class="muted">۵۰ رویداد آخر، بدون نمایش رمز عبور، کلید یا کد تخفیف.</p>
<table>
<thead><tr><th>رویداد</th><th>عامل</th><th>هدف</th><th>زمان</th></tr></thead>
<tbody>
@forelse ($events as $event)
<tr>
<td>{{ $event->event_type }}</td>
<td>{{ $event->actor_id ?? 'CLI' }}</td>
<td>{{ $event->subject_id ?? '—' }}</td>
<td>{{ $event->created_at }}</td>
</tr>
@empty
<tr><td colspan="4">هنوز رویداد مدیریتی ثبت نشده است.</td></tr>
@endforelse
</tbody></table>
</section>
@endsection
