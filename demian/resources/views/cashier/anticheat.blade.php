@extends('cashier.layout')
@section('title', 'پایش ضدتقلب | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<h1>گام ۱۰ — پایش ضدتقلب</h1>
<p class="muted">هشدارهای الگوریتمی فقط نشانه نیاز به بررسی هستند، نه اثبات تخلف. هیچ امتیاز یا کوپن خودکار حذف نمی‌شود. IP خام، کلید دسترسی و مدرک خام Replay نمایش داده نمی‌شود.</p>
@if(session('notice'))<div class="ok" role="status">{{ session('notice') }}</div>@endif
@if($errors->any())<div class="alert" role="alert">{{ $errors->first() }}</div>@endif
<section class="panel">
<h2>وضعیت پایش</h2>
<p class="pill">جمع‌آوری رخدادها: {{ $summary['enabled'] ? 'فعال' : 'غیرفعال' }}</p>
<table>
<thead><tr><th>پرونده‌های باز</th><th>اولویت بالا</th><th>تأیید‌شده</th><th>مشاهدات ۲۴ ساعت</th><th>خطاهای Replay</th><th>محدودیت فعال</th></tr></thead>
<tbody><tr><td>{{ $summary['unresolved'] }}</td><td>{{ $summary['high_priority'] }}</td>
<td>{{ $summary['confirmed'] }}</td><td>{{ $summary['observations_24h'] }}</td>
<td>{{ $summary['rejections_24h'] }}</td><td>{{ $summary['active_holds'] }}</td></tr></tbody></table>
<p class="muted">فیلتر پرونده:
<a href="{{ route('cashier.anticheat') }}">همه</a> ·
<a href="{{ route('cashier.anticheat', ['status' => 'open']) }}">باز</a> ·
<a href="{{ route('cashier.anticheat', ['status' => 'investigating']) }}">در حال بررسی</a> ·
<a href="{{ route('cashier.anticheat', ['status' => 'confirmed']) }}">تأیید‌شده</a>
</p>
</section>
<section class="panel">
<h2>۱۰۰ پرونده آخر (شناسه‌های داخلی)</h2>
<table><thead><tr><th>پرونده</th><th>حساب / بازی</th><th>نشانه / ریسک</th><th>وضعیت</th><th>تکرار / زمان</th></tr></thead><tbody>
@forelse($reports as $report)
<tr>
<td>#{{ $report->id }}</td>
<td><small>{{ $report->player_id ?? 'حذف شده' }}</small><p><small>{{ $report->run_id ?? '—' }}</small></p></td>
<td>{{ $report->signal }} · {{ $report->severity }} ({{ $report->risk_score }})</td>
<td>{{ $report->status }}</td>
<td>{{ $report->hits }} · {{ $report->last_seen }}</td>
</tr>
@empty
<tr><td colspan="5">هنوز پرونده‌ای ثبت نشده است.</td></tr>
@endforelse
</tbody></table>
</section>
@if($canReview)
<section class="panel">
<h2>ثبت تصمیم انسانی (فقط سوپرادمین)</h2>
<p class="muted">برای هر تصمیم توضیح واقعی، رمز عبور فعلی و تأیید مجدد لازم است. تصمیم تأیید تخلف خودش امتیاز یا جایزه را حذف نمی‌کند.</p>
<form method="post" id="review-form" action="{{ url('/cashier/admin/anti-cheat/1/review') }}" autocomplete="off">
@csrf
<label for="review-id">شناسه پرونده</label>
<input id="review-id" name="report_id_display" type="number" min="1" required
 oninput="this.form.action='{{ url('/cashier/admin/anti-cheat') }}/'+this.value+'/review'">
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
<h2>محدودیت موقت ثبت مسابقه جدید</h2>
<p class="muted">فقط روی پرونده با تخلف تأییدشده، حداکثر ۷ روز؛ امکان تکمیل مسابقه‌های شروع‌شده، رتبه‌ها و کوپن‌ها را تغییر نمی‌دهد.</p>
<form method="post" action="{{ url('/cashier/admin/anti-cheat/1/hold') }}" autocomplete="off">
@csrf
<label for="hold-id">شناسه پرونده تأیید‌شده</label>
<input id="hold-id" type="number" min="1" required
 oninput="this.form.action='{{ url('/cashier/admin/anti-cheat') }}/'+this.value+'/hold'">
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
@endif
<section class="panel">
<h2>۵۰ رویداد آخر ممیزی</h2>
<table><thead><tr><th>پرونده</th><th>عامل</th><th>تصمیم</th><th>از / به</th><th>زمان</th></tr></thead><tbody>
@forelse($reviews as $event)
<tr><td>#{{ $event->report_id }}</td><td>{{ $event->actor_id ?? '—' }}</td>
<td>{{ $event->action }}</td><td>{{ $event->previous_status }} / {{ $event->next_status }}</td>
<td>{{ $event->created_at }}</td></tr>
@empty
<tr><td colspan="5">هنوز تصمیم انسانی ثبت نشده است.</td></tr>
@endforelse
</tbody></table>
</section>
@endsection
