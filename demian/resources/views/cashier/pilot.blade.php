@extends('cashier.layout')
@section('title','پایلوت تجاری | دمیان')
@section('content')
<a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a>
<section class="panel"><h1>پایلوت تجاری و بهینه‌سازی مستمر</h1>
<p class="muted">این ابزار هیچ تخفیف یا تنظیم Production را فعال نمی‌کند. توقف برنامه نیز باید با توقف عملیاتی صدور و بررسی کوپن‌های موجود همراه باشد.</p>
@if($errors->any())<p class="alert" role="alert">{{ $errors->first() }}</p>@endif
<p>پیش‌نیاز پایلوت واقعی: {{ $preflight['passed']?'کنترل‌های خودکار موفق؛ تأیید انسانی همچنان لازم':'مسدود' }}</p>
<table><thead><tr><th>کنترل</th><th>نتیجه</th></tr></thead><tbody>@foreach($preflight['checks'] as $k=>$v)<tr><td>{{ $k }}</td><td>{{ $v?'موفق':'ناموفق' }}</td></tr>@endforeach</tbody></table>
<h2>برنامه‌های ثبت‌شده</h2>
@forelse($plans as $plan)<p><a href="{{ route('cashier.pilot',['id'=>$plan->id]) }}">{{ $plan->branch_id }} · {{ $plan->pilot_start }} · {{ $plan->mode }} · {{ $plan->status }}</a></p>@empty<p>هیچ پایلوتی ثبت نشده است.</p>@endforelse
</section>
@if(!$detail)
<section class="panel"><h2>ثبت برنامه</h2>
<p>خط پایه و پایلوت، هرکدام ۷، ۱۴ یا ۲۸ روز کامل متوالی با روزهای هفته یکسان؛ شروع از فردا تا ۳۰ روز آینده. مقادیر را از سیاست واقعی مالک وارد کنید.</p>
<form method="post" action="{{ route('cashier.pilot.create') }}">@csrf
<label>شعبه<select name="branch_id" required>@foreach($branches as $b)<option>{{ $b }}</option>@endforeach</select></label>
<label>نوع<select name="mode"><option value="rehearsal">تمرینی غیرتجاری</option><option value="live">واقعی (مشروط)</option></select></label>
<label>شروع تهران<input type="date" name="pilot_start" required></label>
<label>تعداد روز هر دوره<select name="days">@foreach([7,14,28] as $n)<option>{{ $n }}</option>@endforeach</select></label>
<label>ارز<input name="currency" maxlength="3" required placeholder="IRR"></label>
@foreach(['discount_budget_minor'=>'سقف بودجه تخفیف پایلوت','minimum_receipts'=>'حداقل رسید هر دوره (حداقل ۲۰)','target_uplift_bps'=>'هدف رشد سهم مشارکت (واحد یک‌صدم درصد)'] as $k=>$label)
<label>{{ $label }}<input type="number" name="{{ $k }}" min="0" required></label>@endforeach
@include('cashier.pilot-credentials')<button>ثبت برنامه</button></form></section>
@else
@php($p=$detail['pilot'])
@php($report=$detail['report'])
<section class="panel"><h2>برنامه {{ $p->branch_id }} / {{ $p->mode }}</h2>
<p>وضعیت: {{ $p->status }} · پایه از {{ $p->baseline_start }} · شروع پایلوت {{ $p->pilot_start }} · {{ $p->days }} روز · {{ $p->currency }}</p>
<table><thead><tr><th>شاخص</th><th>پایه</th><th>پایلوت</th></tr></thead><tbody>
@foreach(['days'=>'روزهای ثبت','receipts'=>'کل رسید گزارش‌شده صندوق','net_sales_minor'=>'فروش خالص صندوق','variable_cost_minor'=>'هزینه متغیر','operating_cost_minor'=>'هزینه عملیاتی','contribution_minor'=>'سهم مشارکت پس از هزینه‌ها','coupon_receipts'=>'رسید کوپن','coupon_discount_minor'=>'تخفیف کوپن','coupon_net_minor'=>'فروش خالص ثبت‌شده کوپن','qr_launches'=>'ورود QR (نه مشتری)','incidents'=>'رخداد بحرانی'] as $k=>$label)
<tr><td>{{ $label }}</td><td>{{ number_format($report['baseline'][$k]) }}</td><td>{{ number_format($report['pilot'][$k]) }}</td></tr>@endforeach</tbody></table>
<p>رشد سهم مشارکت: {{ $report['contribution_change_percent']===null?'نامشخص':$report['contribution_change_percent'].'٪' }} · بودجه {{ number_format($p->discount_budget_minor) }} · تخفیف واقعی دفتر {{ number_format($report['recorded_pilot_discount_minor']) }}</p>
<p>تطبیق فعلی دفتر: {{ $report['ledger_consistent']?'موفق':'عدم تطبیق' }} · توصیه: {{ $report['recommendation'] }} · تصمیم ثبت‌شده: {{ $p->decision??'—' }}</p>
<p class="muted">خلاصه شواهد هنگام تصمیم نهایی در رویداد ممیزی ذخیره می‌شود. مقایسه قبل/بعد با داده اظهارشده صندوق است، نه آزمایش تصادفی یا ROI علّی. ارقام تمرینی نباید وارد گزارش تجاری واقعی شوند. بودجه این برنامه صرفاً هشدار مدیریتی است؛ محدودیت‌های صدور در سرویس‌های مالی مستقل اجرا می‌شوند.</p>
</section>
@if(in_array($p->status,['draft','active'],true))
<section class="panel"><h2>ثبت گزارش روز کامل</h2>
<form method="post" action="{{ route('cashier.pilot.mutate',[$p->id,'record']) }}">@csrf
<label>تاریخ تهران<input name="day" type="date" required></label>
@foreach(['receipts'=>'تعداد کل رسید','net_sales_minor'=>'فروش خالص (پس از همه تخفیف‌ها)','variable_cost_minor'=>'هزینه متغیر','operating_cost_minor'=>'هزینه عملیاتی تخصیص‌یافته','incidents'=>'رخداد بحرانی حل‌نشده یا رخ‌داده'] as $k=>$label)
<label>{{ $label }}<input name="{{ $k }}" type="number" min="0" required></label>@endforeach
@include('cashier.pilot-credentials')<button>ثبت قطعی روز</button></form></section>
<section class="panel"><h2>تصمیم و توقف</h2>
@foreach($p->status==='draft'?['start','stop']:['iterate','inconclusive','review_scale','stop'] as $op)
<form method="post" action="{{ route('cashier.pilot.mutate',[$p->id,$op]) }}">@csrf
@include('cashier.pilot-credentials')<button class="secondary">{{ $op }}</button></form>@endforeach
</section>
@endif
<section class="panel"><h2>اقدام اصلاحی</h2>
<form method="post" action="{{ route('cashier.pilot.mutate',[$p->id,'action']) }}">@csrf
<label>دسته<select name="category">@foreach(\App\Services\Arcade\CommercialPilot::CATEGORIES as $c)<option>{{ $c }}</option>@endforeach</select></label>
<label>شاخص موفقیت<select name="success_metric">@foreach(\App\Services\Arcade\CommercialPilot::METRICS as $m)<option>{{ $m }}</option>@endforeach</select></label>
<label>موعد<input type="date" name="due_day" required></label>
@include('cashier.pilot-credentials')<button>ثبت اقدام</button></form>
@foreach($detail['actions'] as $a)
<p>{{ $a->category }} · {{ $a->success_metric }} · {{ $a->due_day }} · {{ $a->status }} · {{ $a->evidence_ref }}</p>
@if($a->status==='open')<form method="post" action="{{ route('cashier.pilot.mutate',[$p->id,'resolve']) }}">@csrf
<input type="hidden" name="action_id" value="{{ $a->id }}">@include('cashier.pilot-credentials')<button>ثبت تکمیل اقدام</button></form>@endif
@endforeach
</section>
<section class="panel"><h2>شواهد و تاریخچه</h2>
@foreach($detail['daily'] as $d)<p>{{ $d->day }} · {{ $d->period }} · {{ $d->evidence_ref }}</p>@endforeach
@foreach($detail['events'] as $e)<p>{{ $e->created_at }} · {{ $e->event_type }} · {{ $e->evidence_ref }}</p>@endforeach
</section>
@endif
@endsection
