@extends('cashier.layout')
@section('title', 'تحلیل کسب‌وکار | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a>
<a class="button secondary" href="{{ route('cashier.business-analytics',['days'=>$report['days'],'format'=>'json']) }}">دریافت JSON تجمیعی</a>
<a class="button secondary" href="{{ route('cashier.business-analytics',['days'=>$report['days'],'format'=>'csv']) }}">دریافت CSV</a></div>
<section class="panel">
<h1>تحلیل کسب‌وکار و رفتار بازیکنان</h1>
<form method="get" action="{{ route('cashier.business-analytics') }}">
<label for="days">بازه گزارش (روز کامل تهران)</label>
<select id="days" name="days">@foreach([7,30,90] as $days)<option value="{{ $days }}" @selected($report['days']===$days)>{{ $days }}</option>@endforeach</select>
<p><button type="submit">نمایش گزارش</button></p>
</form>
<p class="muted">از {{ $report['from'] }} تا پیش از {{ $report['until_exclusive'] }} · روز جاری در شاخص‌های تاریخی محاسبه نمی‌شود.</p>
@php($a=$report['acquisition'])
@php($e=$report['engagement'])
<div class="cards">
@foreach(['ثبت‌نام'=>$a['registrations'],'ثبت‌نام تأییدشده'=>$a['verified_registrations'],'بازیکن جدید فعال'=>$a['new_players_with_verified_run'],'بازیکن فعال'=>$e['active_players'],'بازی معتبر'=>$e['verified_runs'],'فعال هفت روز اخیر'=>$report['wau'],'فعال سی روز اخیر'=>$report['mau']] as $label=>$value)
<div class="card">{{ $label }}<strong>{{ number_format($value) }}</strong></div>
@endforeach
</div>
<p>نرخ تأیید شماره: {{ $a['registration_verification_percent']===null?'داده ناکافی':$a['registration_verification_percent'].'٪' }} · نرخ فعال‌سازی: {{ $a['registration_activation_percent']===null?'داده ناکافی':$a['registration_activation_percent'].'٪' }}</p>
<p>ثبت‌نام دعوتی: {{ $a['referral_registrations'] }} · دعوت موفق تا انتهای بازه: {{ $a['qualified_referrals'] }} · نرخ تبدیل: {{ $a['referral_conversion_percent']===null?'داده ناکافی':$a['referral_conversion_percent'].'٪' }}</p>
<p class="muted">فقط حساب‌های باقی‌مانده و بازی‌های تأییدشده توسط سرور. بازیکن، معادل یک شخص یکتا نیست؛ بازی تمرینی و آفلاین محاسبه نمی‌شود.</p>
</section>
<section class="panel">
<h2>ماندگاری روز دقیق D1 / D7 / D30</h2>
@if($report['retention']['status']==='incomplete')<p role="alert">داده بیش از حد مجاز است؛ نرخ ناقص به عنوان نتیجه قطعی نمایش داده نمی‌شود.</p>@else
<div class="cards">@foreach($report['retention']['rates'] as $day=>$r)
<div class="card">{{ strtoupper($day) }}<strong>{{ $r['percent']===null?'داده ناکافی':$r['percent'].'٪' }}</strong>{{ $r['returned'] }} بازگشت / {{ $r['eligible'] }} واجد شرایط</div>
@endforeach</div>
<table><thead><tr><th>ثبت‌نام (تهران)</th><th>تعداد</th><th>D1</th><th>D7</th><th>D30</th></tr></thead><tbody>
@foreach($report['retention']['cohorts'] as $row)<tr><td>{{ $row['joined'] }}</td><td>{{ $row['players'] }}</td>
@foreach(['d1','d7','d30'] as $day)<td>{{ $row[$day]===null?'—':$row[$day]['percent'].'٪' }}</td>@endforeach</tr>@endforeach
</tbody></table>
@endif
</section>
<section class="panel">
<h2>مشارکت بازی‌ها</h2>
<table><thead><tr><th>بازی</th><th>بازی معتبر</th><th>بازیکن مجزا</th></tr></thead><tbody>
@forelse($e['games'] as $g)<tr><td>{{ $g['game_id'] }}</td><td>{{ $g['runs'] }}</td><td>{{ $g['players'] }}</td></tr>@empty<tr><td colspan="3">بدون داده</td></tr>@endforelse
</tbody></table>
<p class="muted">جمع بازیکنان بازی‌ها ممکن است بیشتر از بازیکنان کل باشد.</p>
<h2>روند هفت‌روزه</h2>
<table><thead><tr><th>شروع بازه</th><th>پایان انحصاری</th><th>ثبت‌نام</th><th>بازیکن فعال</th><th>بازی معتبر</th></tr></thead><tbody>
@foreach($report['trend'] as $t)<tr><td>{{ $t['from'] }}</td><td>{{ $t['until_exclusive'] }}</td><td>{{ $t['registrations'] }}</td><td>{{ $t['active_players'] }}</td><td>{{ $t['verified_runs'] }}</td></tr>@endforeach
</tbody></table>
</section>
<section class="panel">
<h2>عملکرد تخفیف و خرید حضوری</h2>
@php($c=$report['coupon_cohort'])
<p>کوپن صادرشده در بازه: {{ $c['issued'] }} · مصرف حضوری تا پایان بازه: {{ $c['redeemed_in_cafe_before_cutoff'] }} · نرخ: {{ $c['redemption_percent']===null?'داده ناکافی':$c['redemption_percent'].'٪' }}</p>
<table><thead><tr><th>ارز</th><th>رسید</th><th>سبد ناخالص</th><th>تخفیف</th><th>خالص پس از تخفیف</th></tr></thead><tbody>
@forelse($report['cafe_receipts'] as $m)<tr><td>{{ $m['currency'] }}</td><td>{{ $m['receipts'] }}</td><td>{{ number_format($m['gross_minor']) }}</td><td>{{ number_format($m['discount_minor']) }}</td><td>{{ number_format($m['net_minor']) }}</td></tr>@empty<tr><td colspan="5">بدون رسید حضوری</td></tr>@endforelse
</tbody></table>
<p class="muted">مبالغ بر حسب کوچک‌ترین واحد هر ارز هستند. این فروش ثبت‌شده کوپنی است، نه کل فروش کافه یا سود و فروش افزایشی ناشی از بازی.</p>
@php($r=$report['referral_month_live'])
<h2>هزینه جذب دعوت (ماه جاری، زنده)</h2>
<p>ماه {{ $r['month'] }} · هزینه ثبت‌شده: {{ $r['recorded_spend_irr']===null?'ثبت نشده':number_format($r['recorded_spend_irr']).' ریال' }} · دعوت پاداش‌دار: {{ $r['award_count'] }} · CAC: {{ $r['cac_irr']===null?'داده ناکافی':number_format($r['cac_irr']).' ریال' }}</p>
<a href="{{ route('cashier.referrals') }}">داشبورد و ثبت هزینه دعوت</a>
</section>
@include('cashier.business-commercial',['bi'=>$report['commercial'],'changes'=>$report['engagement_comparison']])
@endsection
