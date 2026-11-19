@extends('cashier.layout')
@section('title', 'بازیکنان و کوپن‌ها | دمیان')
@section('content')
<h1>بازیکنان و کوپن‌ها</h1>
<a class="button secondary" href="{{ route('cashier.index') }}">داشبورد کافه</a>
<form method="get" action="{{ route('cashier.players') }}" class="panel">
  <label for="player-search">نام بازیکن</label>
  <input id="player-search" name="q" value="{{ $search }}" maxlength="50" autocomplete="off" dir="auto">
  <button type="submit">جست‌وجو</button>
</form>
<table aria-label="بازیکنان و کدهای معتبر">
<thead><tr><th scope="col">بازیکن</th><th scope="col">تخفیف هفتگی معتبر</th><th scope="col">هدیهٔ معتبر</th><th scope="col">پرونده</th></tr></thead>
<tbody>
@forelse($players as $player)
@php($active = ($counts->get($player->id) ?? collect())->pluck('total', 'source'))
<tr><td>{{ $player->display_name }}</td><td>{{ $active->get('weekly', 0) }}</td><td>{{ $active->get('gift', 0) }}</td>
<td><a href="{{ route('cashier.players.show', $player) }}">جزئیات</a></td></tr>
@empty
<tr><td colspan="4">بازیکنی پیدا نشد.</td></tr>
@endforelse
</tbody>
</table>
<nav class="row" aria-label="صفحه‌های بازیکنان">
@if($players->previousPageUrl()) <a class="button secondary" href="{{ $players->previousPageUrl() }}">قبلی</a> @endif
@if($players->nextPageUrl()) <a class="button secondary" href="{{ $players->nextPageUrl() }}">بعدی</a> @endif
</nav>
@endsection
