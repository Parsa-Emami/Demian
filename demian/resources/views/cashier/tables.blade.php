@extends('cashier.layout')
@section('title','QR میزهای کافه | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<section class="panel">
<h1>QR اختصاصی میزها</h1>
@if(session('notice'))<p class="ok" role="status">{{ session('notice') }}</p>@endif
@if($errors->any())<p class="alert" role="alert">{{ $errors->first() }}</p>@endif
<p>وضعیت لینک عمومی: {{ $ready?'آماده':'غیرفعال یا تنظیمات ناقص' }}</p>
<p class="muted">شمارش مربوط به دکمه ورود به بازی در ۳۰ روز تقویمی تهران شامل امروز است؛ تعداد اسکن، حضور فیزیکی یا مشتری یکتا نیست. سقف روزانه هر میز ۲۰۰۰ ثبت است.</p>
<table><thead><tr><th>شعبه</th><th>میز</th><th>وضعیت</th><th>ورود ۳۰ روز</th><th>چاپ</th></tr></thead><tbody>
@forelse($tables as $t)<tr><td>{{ $t['branch'] }}</td><td>{{ $t['label'] }}</td><td>{{ $t['active']?'فعال':'غیرفعال' }}</td><td>{{ $t['launches_30d'] }}</td><td>@if($ready&&$t['active'])<a href="{{ route('cashier.tables.print',$t['id']) }}">QR قابل چاپ</a>@else — @endif</td></tr>@empty<tr><td colspan="5">هنوز میزی ثبت نشده است.</td></tr>@endforelse
</tbody></table>
</section>
<section class="panel">
<h2>ثبت میز</h2>
<form method="post" action="{{ route('cashier.tables.create') }}">@csrf
<label for="branch">شعبه</label><select id="branch" name="branch" required>@foreach($branches as $b)<option value="{{ $b }}">{{ $b }}</option>@endforeach</select>
<label for="label">نام/شماره میز</label><input id="label" name="label" maxlength="40" required>
<label for="pass-create">رمز سوپرادمین</label><input id="pass-create" name="password" type="password" autocomplete="current-password" required>
<label class="check"><input type="checkbox" name="confirmed" value="1" required>ثبت را تأیید می‌کنم.</label>
<button>ساخت میز و QR</button></form>
</section>
@foreach($tables as $t)
<section class="panel">
<h2>مدیریت {{ $t['branch'] }} / {{ $t['label'] }}</h2>
@foreach([$t['active']?'disable':'enable','rotate'] as $action)
<form method="post" action="{{ route('cashier.tables.change',[$t['id'],$action]) }}">@csrf
<label for="pass-{{ $t['id'] }}-{{ $action }}">رمز سوپرادمین</label>
<input id="pass-{{ $t['id'] }}-{{ $action }}" name="password" type="password" autocomplete="current-password" required>
<label class="check"><input type="checkbox" name="confirmed" value="1" required>{{ $action==='rotate'?'تعویض کد و ابطال پوستر قبلی را تأیید می‌کنم.':'تغییر وضعیت را تأیید می‌کنم.' }}</label>
<button class="secondary">{{ ['rotate'=>'تعویض QR','enable'=>'فعال‌سازی','disable'=>'غیرفعال‌سازی'][$action] }}</button>
</form>
@endforeach
</section>
@endforeach
@endsection
