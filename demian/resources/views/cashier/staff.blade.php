@extends('cashier.layout')
@section('title', 'فهرست کارکنان | دمیان')
@section('content')
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">بازگشت</a></div>
<section class="panel">
<h1>فهرست کارکنان کافه</h1>
<p class="muted">ادمین فقط فهرست شعبه خود را می‌بیند و امکان تغییر دسترسی ندارد. تغییر وضعیت کارکنان فقط با تأیید رمز سوپرادمین مجاز است. ساخت و تغییر نقش صرفاً از ترمینال امن سرور انجام می‌شود.</p>
@if (session('notice'))<div class="ok" role="status">{{ session('notice') }}</div>@endif
<table>
<thead><tr><th>کاربر</th><th>نام</th><th>شعبه</th><th>نقش</th><th>وضعیت</th>@if ($canManage)<th>اقدام</th>@endif</tr></thead>
<tbody>
@forelse ($records as $row)
<tr>
<td>{{ $row->username }}</td><td>{{ $row->display_name }}</td>
<td>{{ $row->branch_id }}</td><td>{{ $row->role }}</td>
<td>{{ $row->is_active ? 'فعال' : 'غیرفعال' }}</td>
@if ($canManage)
<td>
@if ($row->role !== 'super_admin')
<form method="post" action="{{ route('cashier.staff.action', ['subjectId' => $row->id, 'operation' => $row->is_active ? 'disable' : 'enable']) }}">
@csrf
<label for="pw-{{ $row->id }}">رمز سوپرادمین</label>
<input id="pw-{{ $row->id }}" name="password" type="password" required autocomplete="current-password">
<label class="check"><input type="checkbox" name="confirmed" value="1" required><span>تأیید اقدام</span></label>
<button type="submit">{{ $row->is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی' }}</button>
</form>
@else
<span class="muted">حساب محافظت‌شده</span>
@endif
</td>
@endif
</tr>
@empty
<tr><td colspan="{{ $canManage ? 6 : 5 }}">کاربری برای نمایش وجود ندارد.</td></tr>
@endforelse
</tbody>
</table>
</section>
@endsection
