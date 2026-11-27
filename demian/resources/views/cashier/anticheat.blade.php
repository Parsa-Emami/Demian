@extends('cashier.layout')
@section('title', 'پایش ضدتقلب | دمیان')
@push('styles')
<style>
    .fraud-filters,.fraud-evidence{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .fraud-overview{grid-template-columns:repeat(auto-fit,minmax(126px,1fr))}
    .fraud-overview .card{display:block;color:inherit;text-decoration:none}
    .fraud-overview a:hover{border-color:#e0bf86}
    .fraud-toolbar{margin-top:16px}
    .fraud-table td{white-space:normal;min-width:96px}
    .fraud-table bdi{overflow-wrap:anywhere}
    .fraud-evidence dt{color:#bfc8c7}.fraud-evidence dd{margin:4px 0 0;overflow-wrap:anywhere}
    .fraud-queue summary{cursor:pointer;min-height:44px;padding:10px 0;font-weight:700}
    .fraud-queue table{max-height:23rem;overflow:auto}
    @media(max-width:520px){.fraud-filters,.fraud-evidence{grid-template-columns:1fr}}
</style>
@endpush
@section('content')
@php
    $statuses = ['open' => 'باز', 'investigating' => 'در حال بررسی',
        'cleared' => 'رد شده', 'confirmed' => 'تأیید انسانی'];
    $severityLabels = ['high' => 'بالا', 'medium' => 'متوسط', 'low' => 'پایین'];
    $evidenceLabels = [
        'related_accounts' => 'حساب‌های مرتبط هنگام ثبت',
        'accounts' => 'تعداد حساب‌ها', 'window_minutes' => 'بازهٔ مشاهده به دقیقه',
        'window_days' => 'بازهٔ بررسی به روز', 'rejections' => 'تعداد رد بازپخش',
        'rejections_per_account' => 'حداقل تعداد رد برای هر حساب', 'http_status' => 'کد پاسخ',
        'starts' => 'تعداد شروع دور', 'same_input_digest' => 'بازپخش یکسان',
        'overlap_confirmed' => 'هم‌پوشانی زمانی ثبت‌شده', 'score' => 'امتیاز دور',
        'baseline_median' => 'میانهٔ بهترین امتیازها', 'sample_size' => 'تعداد بازیکنان نمونه',
        'ratio_threshold' => 'نسبت معیار', 'ticks' => 'تعداد گام‌های شبیه‌سازی',
        'tick_rate' => 'گام در ثانیه', 'input_events' => 'تعداد ورودی‌ها',
        'intervals' => 'تعداد فاصله‌های پرش', 'duration_ticks' => 'مدت دور به گام',
    ];
    $time = static fn (?string $value): string => $value
        ? \Carbon\CarbonImmutable::parse($value, 'UTC')->timezone('Asia/Tehran')->format('Y-m-d H:i')
        : '—';
@endphp
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<h1>پایش تقلب و چندحسابی</h1>
<p class="muted">هشدارها برای بررسی انسانی ثبت می‌شوند. استفاده از شبکهٔ مشترک کافه و بازپخش یکسان در مراحل ثابت می‌تواند طبیعی باشد.</p>
@if(session('notice'))<div class="ok" role="status">{{ session('notice') }}</div>@endif
@if($errors->any())<div class="alert" role="alert">{{ $errors->first() }}</div>@endif
<section class="panel">
<h2>وضعیت پایش</h2>
<p class="pill">جمع‌آوری رخدادها: {{ $summary['enabled'] ? 'فعال' : 'غیرفعال' }}</p>
<div class="cards fraud-overview">
    <a class="card" href="{{ route('cashier.anticheat', ['signal' => 'multi_account', 'status' => 'active']) }}#cases">چندحسابی در انتظار رسیدگی<strong>{{ $summary['multi_account_open'] }}</strong></a>
    <div class="card">در انتظار رسیدگی<strong>{{ $summary['unresolved'] }}</strong></div>
    <div class="card">هشدارهای مهم<strong>{{ $summary['high_priority'] }}</strong></div>
    <div class="card">تأیید انسانی<strong>{{ $summary['confirmed'] }}</strong></div>
    <div class="card">رخدادهای ۲۴ ساعت<strong>{{ $summary['observations_24h'] }}</strong></div>
    <div class="card">رد بازپخش در ۲۴ ساعت<strong>{{ $summary['rejections_24h'] }}</strong></div>
    <div class="card">محدودیت فعال<strong>{{ $summary['active_holds'] }}</strong></div>
</div>
<details class="fraud-queue">
    <summary>اولویت رسیدگی به حساب‌ها در ۷ روز اخیر</summary>
    <p class="muted">تا ۱۰۰ حساب با هشدار باز اخیر. هشدارهای هم‌نوع یک‌بار در امتیاز اولویت حساب می‌شوند.</p>
    <table class="fraud-table"><thead><tr><th>حساب</th><th>امتیاز اولویت</th><th>نوع شواهد</th><th>پرونده</th><th>آخرین رخداد به وقت تهران</th></tr></thead><tbody>
    @forelse($riskQueue as $account)
        <tr><td><a href="{{ route('cashier.anticheat', ['player' => $account['player_id']]) }}#cases"><bdi>{{ $account['player_id'] }}</bdi></a></td>
            <td>{{ $account['risk'] ? $account['risk'].' از ۱۰۰' : 'زمینهٔ بررسی' }}</td>
            <td>{{ $account['families'] }}</td><td>{{ $account['cases'] }}</td><td><bdi>{{ $time($account['last_seen']) }}</bdi></td></tr>
    @empty
        <tr><td colspan="5">پروندهٔ فعالی در این بازه ثبت نشده است.</td></tr>
    @endforelse
    </tbody></table>
</details>
</section>
<section class="panel" id="shared-registrations">
<h2>ثبت چند حساب از شبکهٔ مشترک</h2>
<p class="muted">در ۲۴ ساعت گذشته، ثبت شماره‌های متفاوت از یک شبکه در کنار هم نمایش داده می‌شود. برای محدودیت موقت حساب، پروندهٔ همان حساب را بررسی و شواهد تخلف را تأیید کنید.</p>
@forelse($sharedRegistrations as $group)
<details class="fraud-queue" @if($loop->first) open @endif>
    <summary>{{ $group['count'] }} حساب · آخرین ثبت <bdi>{{ $time($group['last_seen']) }}</bdi></summary>
    <table class="fraud-table"><thead><tr><th>حساب و پرونده‌ها</th><th>تأیید شماره</th><th>زمان ثبت تهران</th></tr></thead><tbody>
    @foreach($group['accounts'] as $account)
    <tr>
        <td><a href="{{ route('cashier.anticheat', ['player' => $account['id']]) }}#cases"><bdi>{{ $account['name'] }}</bdi></a></td>
        <td>{{ $account['verified'] ? 'تأیید شده' : 'در انتظار تأیید' }}</td>
        <td><bdi>{{ $time($account['registered_at']) }}</bdi></td>
    </tr>
    @endforeach
    </tbody></table>
    @if($group['count'] > $group['accounts']->count())
        <p class="muted">۱۰ حساب اخیر این شبکه نمایش داده می‌شود.</p>
    @endif
</details>
@empty
<p class="muted">ثبت مشترکی در این بازه پیدا نشد.</p>
@endforelse
</section>
<section class="panel" id="cases">
<h2>پرونده‌ها</h2>
<form method="get" action="{{ route('cashier.anticheat') }}#cases">
    <div class="fraud-filters">
        <div><label for="fraud-signal">نوع هشدار</label>
        <select name="signal" id="fraud-signal">
            <option value="">همهٔ هشدارها</option>
            @foreach($signalLabels as $code => $label)
                <option value="{{ $code }}" @selected(($filters['signal'] ?? '') === $code)>{{ $label }}</option>
            @endforeach
        </select></div>
        <div><label for="fraud-status">وضعیت</label>
        <select name="status" id="fraud-status">
            <option value="">همهٔ وضعیت‌ها</option>
            <option value="active" @selected(($filters['status'] ?? '') === 'active')>در انتظار رسیدگی</option>
            @foreach($statuses as $code => $label)
                <option value="{{ $code }}" @selected(($filters['status'] ?? '') === $code)>{{ $label }}</option>
            @endforeach
        </select></div>
        <div><label for="fraud-player">شناسهٔ حساب</label>
        <input type="text" id="fraud-player" name="player" maxlength="36" value="{{ $filters['player'] ?? '' }}"></div>
    </div>
    <div class="row fraud-toolbar"><button type="submit">اعمال فیلتر</button>
        <a class="button secondary" href="{{ route('cashier.anticheat') }}#cases">پاک کردن فیلتر</a></div>
</form>
<p class="muted">{{ $reports->total() }} پرونده</p>
<table class="fraud-table"><thead><tr><th>پرونده</th><th>حساب</th><th>نشانه / اولویت</th><th>وضعیت</th><th>تکرار / آخرین رخداد تهران</th></tr></thead><tbody>
@forelse($reports as $report)
<tr>
<td><a href="{{ route('cashier.anticheat', [...$filters, 'report' => $report->id, 'page' => $reports->currentPage()]) }}#case-details">پرونده <bdi>#{{ $report->id }}</bdi></a></td>
<td><small><bdi>{{ $report->player_id ?? 'حذف‌شده' }}</bdi></small></td>
<td>{{ $signalLabels[$report->signal] ?? 'هشدار ثبت‌شده' }} <small>· {{ $severityLabels[$report->severity] ?? '—' }}</small></td>
<td>{{ $statuses[$report->status] ?? '—' }}</td>
<td>{{ $report->hits }} · <bdi>{{ $time($report->last_seen) }}</bdi></td>
</tr>
@empty
<tr><td colspan="5">پرونده‌ای با فیلترهای فعلی پیدا نشد.</td></tr>
@endforelse
</tbody></table>
@if($reports->hasPages())
<nav class="row fraud-toolbar" aria-label="صفحه‌بندی پرونده‌ها">
    @if($reports->previousPageUrl())<a class="button secondary" href="{{ $reports->previousPageUrl() }}#cases">صفحهٔ قبلی</a>@endif
    <span>صفحهٔ {{ $reports->currentPage() }} از {{ $reports->lastPage() }}</span>
    @if($reports->nextPageUrl())<a class="button secondary" href="{{ $reports->nextPageUrl() }}#cases">صفحهٔ بعدی</a>@endif
</nav>
@endif
</section>
@if($selected)
<section class="panel" id="case-details">
<h2>شواهد پرونده <bdi>#{{ $selected->id }}</bdi></h2>
<p>{{ $signalLabels[$selected->signal] ?? 'هشدار ثبت‌شده' }} · {{ $statuses[$selected->status] ?? '—' }}</p>
<dl class="fraud-evidence">
    <div><dt>حساب</dt><dd><bdi>{{ $selected->player_id ?? 'حذف‌شده' }}</bdi></dd></div>
    <div><dt>شناسهٔ دور</dt><dd><bdi>{{ $selected->run_id ?? '—' }}</bdi></dd></div>
    @if($selectedRun)
    <div><dt>بازی</dt><dd><bdi>{{ $selectedRun->game_id }}</bdi></dd></div>
    <div><dt>نسخهٔ قوانین</dt><dd><bdi>{{ $selectedRun->rules_version }}</bdi></dd></div>
    @endif
    <div><dt>اولین رخداد به وقت تهران</dt><dd><bdi>{{ $time($selected->first_seen) }}</bdi></dd></div>
    <div><dt>آخرین رخداد به وقت تهران</dt><dd><bdi>{{ $time($selected->last_seen) }}</bdi></dd></div>
    @foreach((array) json_decode($selected->evidence, true) as $key => $value)
        @if(isset($evidenceLabels[$key]) && (is_int($value) || is_bool($value)))
        <div><dt>{{ $evidenceLabels[$key] }}</dt><dd>{{ is_bool($value) ? ($value ? 'بله' : 'خیر') : $value }}</dd></div>
        @endif
    @endforeach
</dl>
@if($selected->signal === 'cross_account_replay')
    <h3>حساب‌های دارای بازپخش تأییدشدهٔ یکسان</h3>
    <p class="muted">تا ۲۰ حساب با دادهٔ موجود در بازهٔ ثبت پرونده.</p>
    <table class="fraud-table"><thead><tr><th>حساب</th><th>دورهای منطبق</th><th>آخرین تطابق به وقت تهران</th></tr></thead><tbody>
    @forelse($relatedAccounts as $account)
        <tr><td><a href="{{ route('cashier.anticheat', ['player' => $account->player_id]) }}#cases"><bdi>{{ $account->player_id }}</bdi></a></td>
            <td>{{ $account->matching_runs }}</td><td><bdi>{{ $time($account->last_match) }}</bdi></td></tr>
    @empty
        <tr><td colspan="3">دور منطبق در سوابق موجود پیدا نشد.</td></tr>
    @endforelse
    </tbody></table>
@endif
<div class="row fraud-toolbar"><a class="button secondary" href="#review-action">ثبت تصمیم بررسی</a></div>
</section>
@endif
<section class="panel">
<h2>اعتراض‌های بازیکنان (۳۰ مورد اخیر)</h2>
<p class="muted">متن اعتراض در پایگاه داده رمزگذاری می‌شود و فقط برای بررسی انسانی نمایش داده می‌شود.</p>
<table><thead><tr><th>شناسه اعتراض</th><th>پرونده</th><th>دلیل</th><th>توضیح محرمانه</th><th>وضعیت / تاریخ</th></tr></thead>
<tbody>
@forelse($appeals as $appeal)
<tr><td>#{{ $appeal['id'] }}</td><td>#{{ $appeal['report_id'] }}</td>
<td>{{ $appeal['reason_code'] }}</td><td>{{ $appeal['statement'] }}</td>
<td>{{ $appeal['status'] }} · {{ $appeal['created_at'] }}</td></tr>
@empty
<tr><td colspan="5">اعتراض ثبت‌شده‌ای وجود ندارد.</td></tr>
@endforelse
</tbody></table>
</section>
<section class="panel">
<h2>پاسخ به اعتراض (فقط سوپرادمین)</h2>
<p class="muted">پذیرش اعتراض تا رفع محدودیت دستی معتبر امکان‌پذیر نیست. رمز عبور، CSRF و دلیل مستند الزامی است.</p>
<form method="post" action="{{ route('cashier.anticheat.appeal') }}" autocomplete="off">
@csrf
<label>شناسه اعتراض<input type="number" name="appeal_id" min="1" required></label>
<label>تصمیم<select name="decision"><option value="accept">پذیرش و رفع هشدار</option><option value="reject">رد اعتراض</option></select></label>
<label>دلیل تصمیم<textarea name="note" minlength="12" maxlength="500" required></textarea></label>
<label>رمز سوپرادمین<input type="password" name="password" autocomplete="current-password" required></label>
<label class="check"><input type="checkbox" name="confirmed" value="1" required> ثبت تصمیم را تأیید می‌کنم.</label>
<button type="submit">ثبت پاسخ قابل ممیزی</button>
</form>
</section>
<section class="panel" id="review-action">
<h2>ثبت تصمیم انسانی (فقط سوپرادمین)</h2>
<p class="muted">برای هر تصمیم توضیح واقعی، رمز عبور فعلی و تأیید مجدد لازم است. تصمیم تأیید تخلف خودش امتیاز یا جایزه را حذف نمی‌کند.</p>
<form method="post" action="{{ route('cashier.anticheat.review') }}" autocomplete="off">
@csrf
<label for="review-id">شناسه پرونده</label>
<input id="review-id" name="report_id" type="number" min="1" value="{{ $selected->id ?? '' }}" required>
<label for="decision">تصمیم</label>
<select name="decision" id="decision" required>
<option value="investigating">شروع بررسی</option>
<option value="cleared">رد هشدار / پاک</option>
<option value="confirmed">تأیید انسانی تخلف</option>
<option value="reopen">بازگشایی پرونده بسته‌شده</option>
</select>
<label for="review-note">دلیل قابل ممیزی (حداقل ۱۲ نویسه)</label>
<textarea name="note" id="review-note" minlength="12" maxlength="500" required></textarea>
<label for="review-password">رمز عبور سوپرادمین</label>
<input id="review-password" name="password" type="password" autocomplete="current-password" required>
<label class="check"><input type="checkbox" name="confirmed" value="1" required> تصمیم را تأیید می‌کنم.</label>
<button type="submit">ثبت تصمیم</button>
</form>
</section>
<section class="panel">
<h2>محدودیت موقت شروع مسابقه</h2>
<p class="muted">پس از تأیید انسانی، محدودیت شروع دور جدید تا ۷ روز اعمال می‌شود. هشدارهای شبکهٔ مشترک و الگوی منظم پرش فقط قابل بررسی‌اند.</p>
<form method="post" action="{{ route('cashier.anticheat.hold') }}" autocomplete="off">
@csrf
<label for="hold-id">شناسه پرونده تأیید‌شده</label>
<input id="hold-id" name="report_id" type="number" min="1" value="{{ $selected->id ?? '' }}" required>
<label for="hold-action">عملیات</label>
<select id="hold-action" name="operation"><option value="apply">اعمال محدودیت</option><option value="release">رفع محدودیت</option></select>
<label for="hold-hours">مدت (ساعت، ۱ تا ۱۶۸؛ فقط برای اعمال)</label>
<input id="hold-hours" type="number" name="hours" min="1" max="168" value="24">
<label for="hold-note">علت مستند</label>
<textarea id="hold-note" name="note" minlength="12" maxlength="500" required></textarea>
<label for="hold-password">رمز عبور</label>
<input id="hold-password" name="password" type="password" autocomplete="current-password" required>
<label class="check"><input type="checkbox" name="confirmed" value="1" required> عملیات را تأیید می‌کنم.</label>
<button type="submit">ثبت عملیات</button>
</form>
</section>
<section class="panel">
<h2>{{ $selected ? 'رویدادهای ممیزی پرونده' : '۵۰ رویداد آخر ممیزی' }}</h2>
<table><thead><tr><th>پرونده</th><th>عامل</th><th>تصمیم</th><th>از / به</th><th>دلیل ثبت‌شده</th><th>زمان</th></tr></thead><tbody>
@forelse($reviews as $event)
<tr><td>#{{ $event->report_id }}</td><td>{{ $event->actor_id ?? '—' }}</td>
<td>{{ $event->action }}</td><td>{{ $event->previous_status }} / {{ $event->next_status }}</td>
<td>{{ $event->note }}</td><td>{{ $event->created_at }}</td></tr>
@empty
<tr><td colspan="6">هنوز تصمیم انسانی ثبت نشده است.</td></tr>
@endforelse
</tbody></table>
</section>
@endsection
