@extends('cashier.layout')
@section('title', 'جذب مشتری | دمیان')
@section('content')
<section class="panel">
<h1>داشبورد دعوت دوستان</h1>
<p><a href="{{ route('cashier.index') }}">بازگشت به پنل</a></p>
<p>وضعیت: {{ $report['available'] ? 'فعال' : 'غیرفعال' }}</p>
<dl>
<dt>ثبت‌نام منتسب به دعوت</dt><dd>{{ $report['registrations'] }}</dd>
<dt>دعوت موفق</dt><dd>{{ $report['qualified'] }}</dd>
<dt>در انتظار / نیازمند بررسی</dt><dd>{{ $report['pending'] }} / {{ $report['review'] }}</dd>
<dt>منقضی / سقف تکمیل</dt><dd>{{ $report['expired'] }} / {{ $report['capped'] }}</dd>
<dt>نرخ تبدیل ثبت‌نام به دعوت موفق</dt><dd>{{ $report['conversion_percent'] }}٪</dd>
<dt>تعداد پاداش غیرمالی ماه</dt><dd>{{ $report['monthly_awards'] }} / {{ $report['monthly_cap'] }}</dd>
<dt>هزینه پاداش نقدی و تخفیف</dt><dd>صفر (غیرفعال)</dd>
<dt>هزینه واقعی جذب مشتری</dt><dd>اندازه‌گیری نشده؛ هزینه پیامک، نیروی انسانی و تبلیغات جداگانه محاسبه می‌شود.</dd>
</dl>
</section>
@endsection
