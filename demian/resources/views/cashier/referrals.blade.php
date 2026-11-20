@extends('cashier.layout')
@section('title', 'جذب مشتری | دمیان')
@section('content')
<section class="panel">
<h1>داشبورد دعوت دوستان</h1>
@if(session('notice'))<div class="ok" role="status">{{ session('notice') }}</div>@endif
@if($errors->any())<div class="alert" role="alert">{{ $errors->first() }}</div>@endif
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
<dt>هزینه واقعی ماه (ریال)</dt><dd>{{ $report['total_acquisition_cost'] === null ? 'ثبت نشده' : number_format($report['total_acquisition_cost']) }}</dd>
<dt>CAC ماه (ریال به‌ازای دعوت موفق)</dt><dd>{{ $report['cac_irr'] === null ? 'داده ناکافی' : number_format($report['cac_irr']) }}</dd>
<dt>رد شده</dt><dd>{{ $report['rejected'] }}</dd>
</dl>
</section>
<section class="panel">
<h2> ثبت مجموع هزینه‌های واقعی جذب ماه جاری</h2>
<p class="muted">مجموع هزینه تبلیغات، پیامک و نیروی انسانی مرتبط با دعوت در ماه جاری؛ مقادیر به ریال. تا ثبت هزینه واقعی، CAC نامشخص است.</p>
<form method="post" action="{{ route('cashier.referrals.cost') }}">
@csrf
<input type="hidden" name="month" value="{{ $report['month'] }}">
<label for="spend">هزینه واقعی (ریال)</label>
<input id="spend" name="spend_irr" type="number" min="0" max="1000000000000" step="1" required value="{{ $report['total_acquisition_cost'] ?? '' }}">
<label for="cost-password">رمز عبور سوپرادمین</label><input id="cost-password" type="password" name="password" required autocomplete="current-password">
<label class="check"><input type="checkbox" name="confirmed" value="1" required>صحت مبلغ را تأیید می‌کنم.</label>
<button type="submit">ثبت و ممیزی هزینه</button>
</form>
</section>
<section class="panel">
<h2>صف بررسی دعوت‌های مشکوک</h2>
<p class="muted">بازبینی مجدد هیچ محدودیتی را دور نمی‌زند؛ رد کردن، حساب بازیکن را مسدود نمی‌کند.</p>
@if($reviews->isEmpty())<p>درخواستی برای بررسی وجود ندارد.</p>@else
<form method="post" action="{{ route('cashier.referrals.review') }}">
@csrf
<label for="referral">شناسه بررسی</label>
<select id="referral" name="referral_id" required>
@foreach($reviews as $review)<option value="{{ $review->id }}">#{{ $review->id }} · {{ $review->created_at }}</option>@endforeach
</select>
<label for="decision">تصمیم</label><select id="decision" name="decision"><option value="reject">رد دعوت</option><option value="recheck">بررسی دوباره خودکار</option></select>
<label for="review-password">رمز عبور سوپرادمین</label><input id="review-password" type="password" name="password" required autocomplete="current-password">
<label class="check"><input type="checkbox" name="confirmed" value="1" required>تصمیم را تأیید می‌کنم.</label>
<button type="submit">ثبت تصمیم</button>
</form>
@endif
</section>
@endsection
