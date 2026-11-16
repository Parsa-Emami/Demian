@extends('cashier.layout')
@section('title', 'پایش عملیاتی دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت به پنل کافه</a></div>
<section class="panel" aria-labelledby="ops-title">
    <h1 id="ops-title">داشبورد مانیتورینگ دمیان · Step 33</h1>
    <div role="status" class="{{ $result['status'] === 'ok' ? 'ok' : 'alert' }}">
        وضعیت فعلی: {{ $result['status'] === 'ok' ? 'کنترل‌های فعال موفق' : ($result['status'] === 'disabled' ? 'پایش غیرفعال' : 'نیازمند رسیدگی') }}
    </div>
    <p class="muted">داده‌های این صفحه خصوصی و فقط برای نقش دارای مجوز operations.readiness هستند. هیچ شناسه بازیکن، IP، توکن یا کد تخفیف ثبت نمی‌شود.</p>
    <p class="muted">پنجره بررسی: {{ $result['window_minutes'] }} دقیقه. P95 از نمونه‌های ثبت‌شده محاسبه شده و تضمین ظرفیت واقعی هاست نیست.</p>
    @if(!empty($result['checked_at']))<p>آخرین بررسی: {{ $result['checked_at'] }}</p>@endif
    <h2>کنترل‌های سرور</h2>
    <table><thead><tr><th scope="col">کنترل</th><th scope="col">نتیجه</th></tr></thead>
        <tbody>@forelse($result['checks'] as $check)
        <tr><td>{{ $check['code'] }}</td><td>{{ $check['passed'] ? 'موفق' : 'ناموفق' }}</td></tr>
        @empty<tr><td colspan="2">پایش هنوز فعال نشده است.</td></tr>@endforelse</tbody>
    </table>
    <h2>شاخص‌های عملکرد</h2>
    <table><thead><tr><th scope="col">شاخص</th><th scope="col">مقدار</th></tr></thead>
        <tbody>
            <tr><td>نمونه درخواست‌ها</td><td>{{ $result['metrics']['http_samples'] }}</td></tr>
            <tr><td>درخواست‌های تخمینی (نمونه‌برداری)</td><td>{{ $result['metrics']['estimated_requests'] }}</td></tr>
            <tr><td>P95 پاسخ API</td><td>{{ $result['metrics']['http_p95_ms'] ?? 'بدون داده' }} ms</td></tr>
            <tr><td>خطاهای 5xx ثبت‌شده</td><td>{{ $result['metrics']['http_5xx'] }}</td></tr>
            <tr><td>خطاهای 4xx ثبت‌شده</td><td>{{ $result['metrics']['http_4xx'] }}</td></tr>
            <tr><td>نمونه‌های بارگذاری بازی</td><td>{{ $result['metrics']['game_load_samples'] }}</td></tr>
            <tr><td>P95 بارگذاری بازی</td><td>{{ $result['metrics']['game_load_p95_ms'] ?? 'بدون داده' }} ms</td></tr>
            <tr><td>خطاهای بارگذاری گزارش‌شده</td><td>{{ $result['metrics']['game_errors'] }}</td></tr>
            <tr><td>صدک ۱۰ فریم‌ریت گزارش‌شده</td><td>{{ $result['metrics']['fps_p10'] ?? 'بدون داده' }} fps</td></tr>
            <tr><td>عمر آخرین Cron</td><td>{{ $result['cron_age_seconds'] ?? 'نامشخص' }} ثانیه</td></tr>
            <tr><td>فضای آزاد دیسک</td><td>{{ $result['disk_free_mb'] ?? 'نامشخص' }} MiB</td></tr>
        </tbody>
    </table>
    <h2>رخدادهای نیازمند رسیدگی</h2>
    <ul>@forelse($result['alerts'] as $alert)
        <li>{{ $alert }}</li>
        @empty<li>هشدار فعالی گزارش نشد (توجه: نبود نمونه به معنای سلامت تأییدشده نیست).</li>
        @endforelse</ul>
    <p class="muted">{{ $result['note'] }}</p>
    <p><a href="{{ route('cashier.readiness') }}">بررسی آمادگی عملیات کافه</a></p>
</section>
@endsection
