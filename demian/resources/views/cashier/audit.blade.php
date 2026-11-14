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
@endsection
