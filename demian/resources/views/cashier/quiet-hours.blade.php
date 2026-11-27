@extends('cashier.layout')
@section('title','تخفیف ساعات خلوت | دمیان')
@section('content')
<a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a>
<section class="panel">
<h1>تخفیف هوشمند ساعات خلوت</h1>
@if(session('notice'))<p class="ok" role="status">{{ session('notice') }}</p>@endif
@if($errors->any())<p class="alert" role="alert">{{ $errors->first() }}</p>@endif
<p>فعال‌سازی: {{ $enabled?'درخواست شده (مشروط به تأیید مالی و OTP)':'خاموش' }}</p>
<p class="muted">ظرفیت واقعی را اکنون ثبت کنید. فقط حداکثر ۴۰٪ اشغال، حداکثر ۱۰٪ تخفیف، ۲۰ کد و چهار ساعت در همان روز تهران. صدور در حد بودجه مصوب و حاشیه سود است؛ کد فقط در شعبه منتخب و همان بازه مصرف می‌شود. آمار QR معیار حضور فیزیکی نیست.</p>
<form method="post" action="{{ route('cashier.quiet-hours.create') }}">@csrf
<label for="branch">شعبه</label><select id="branch" name="branch_id" required>@foreach($branches as $b)<option value="{{ $b }}">{{ $b }}</option>@endforeach</select>
<label for="start">شروع (تهران، حداکثر ۳۰ دقیقه آینده)</label><input id="start" type="datetime-local" name="starts_at" required>
<label for="end">پایان (تهران)</label><input id="end" type="datetime-local" name="ends_at" required>
@foreach(['occupied_seats'=>['صندلی اشغال‌شده',0,1000],'total_seats'=>['کل صندلی',1,1000],'percent'=>['درصد تخفیف',1,10],'min_order_minor'=>['حداقل خرید (واحد کوچک ارز)',1,1000000000000],'max_discount_minor'=>['سقف تخفیف هر کد',1,1000000000000],'capacity'=>['تعداد مجاز کد',1,20]] as $key=>$field)
<label for="{{ $key }}">{{ $field[0] }}</label><input id="{{ $key }}" name="{{ $key }}" type="number" min="{{ $field[1] }}" max="{{ $field[2] }}" required>
@endforeach
<label for="password">رمز سوپرادمین</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<label class="check"><input type="checkbox" name="confirmed" value="1" required>ظرفیت فعلی و تعهد مالی را تأیید می‌کنم.</label>
<button type="submit">ثبت پیشنهاد</button>
</form>
</section>
<section class="panel">
<h2>گزارش پیشنهادها (۱۰۰ مورد آخر)</h2>
<p class="muted">مبالغ فروش ثبت‌شده مربوط به کوپن‌های همین پیشنهاد است، نه کل فروش یا سود. مبلغ رزرو شده پس از توقف هم آزاد نمی‌شود.</p>
@forelse($offers as $o)
<div class="card">
<strong>{{ $o['branch_id'] }} · {{ $o['percent'] }}٪</strong>
<p>UTC: {{ $o['starts_at'] }} — {{ $o['ends_at'] }} | {{ $o['paused']?'متوقف':'ثبت‌شده' }}</p>
<p>اشغال ثبت‌شده: {{ $o['occupied_seats'] }}/{{ $o['total_seats'] }} · صادرشده {{ $o['claimed'] }}/{{ $o['capacity'] }} · مصرف‌شده {{ $o['redeemed'] }}</p>
<p>{{ $o['currency'] }} · رزرو بودجه {{ number_format($o['reserved_minor']) }} · فروش ناخالص {{ number_format($o['gross']) }} · تخفیف {{ number_format($o['discount']) }}</p>
@if(!$o['paused'])
<form method="post" action="{{ route('cashier.quiet-hours.pause',$o['id']) }}">@csrf
<label for="pass-{{ $o['id'] }}">رمز سوپرادمین</label><input id="pass-{{ $o['id'] }}" type="password" name="password" autocomplete="current-password" required>
<label class="check"><input type="checkbox" name="confirmed" value="1" required>توقف صدور جدید را تأیید می‌کنم.</label><button class="secondary">توقف</button></form>
@endif
</div>
@empty<p>پیشنهادی ثبت نشده است.</p>@endforelse
</section>
@endsection
