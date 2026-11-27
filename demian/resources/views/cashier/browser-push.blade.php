@extends('cashier.layout')
@section('title', 'اعلان مرورگر دمیان')
@section('content')
<h1>اعلان مرورگر</h1>
<div class="row"><a class="button secondary" href="{{ route('cashier.index') }}">داشبورد</a></div>
@if (session('notice'))<div class="ok" role="status">{{ session('notice') }}</div>@endif
@if ($errors->any())<p role="alert">{{ $errors->first() }}</p>@endif
@if ($enabled)
    <form method="post" action="{{ route('cashier.browser-push.publish') }}">
        @csrf
        <input type="hidden" name="request_id" value="{{ $requestId }}">
        <label>عنوان اعلان <input name="title" value="{{ old('title') }}" maxlength="60" required></label>
        <label>متن اعلان <textarea name="body" maxlength="180" required>{{ old('body') }}</textarea></label>
        <label>با انتخاب اعلان باز شود
            <select name="target">
                <option value="home">دمیان</option>
                <option value="leaderboard" @selected(old('target') === 'leaderboard')>لیدربورد</option>
                <option value="rewards" @selected(old('target') === 'rewards')>کیف پول کوپن</option>
            </select>
        </label>
        <label>رمز سوپرادمین <input type="password" name="password" autocomplete="current-password" required></label>
        <label><input type="checkbox" name="confirmed" value="1" required> متن عمومی است و ارسال به مرورگرهای عضو را تأیید می‌کنم.</label>
        <button type="submit">انتشار اعلان</button>
    </form>
@else
    <p>سرویس اعلان هنوز فعال نشده است.</p>
@endif
@if ($notices)
    <h2>اعلان‌های اخیر</h2>
    <table>
        <thead><tr><th>عنوان</th><th>زمان تهران</th><th>گیرنده هنگام انتشار</th><th>پذیرفته‌شده توسط سرویس اعلان</th></tr></thead>
        <tbody>
        @foreach ($notices as $notice)
            <tr>
                <td>{{ $notice['title'] }}</td>
                <td><bdi>{{ \Carbon\CarbonImmutable::parse($notice['created_at'], 'UTC')->setTimezone('Asia/Tehran')->format('Y-m-d H:i') }}</bdi></td>
                <td>{{ $notice['recipients'] }}</td><td>{{ $notice['accepted'] }}</td>
            </tr>
        @endforeach
        </tbody>
    </table>
@endif
@endsection
