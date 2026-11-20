<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>QR میز {{ $table->label }}</title>
<style>
body{font-family:Tahoma,Arial,sans-serif;text-align:center;background:#fff;color:#111;margin:0;padding:24px}main{max-width:420px;margin:auto;border:2px solid #111;padding:28px;border-radius:12px}svg{width:240px;max-width:100%;height:auto;display:block;margin:12px auto}p{overflow-wrap:anywhere}a{color:#111}@media print{body{padding:0}.screen{display:none}main{break-inside:avoid;border:1px solid #111}}
</style></head>
<body><main><h1>DEMIAN</h1><h2>میز {{ $table->label }}</h2><p>{{ $table->branch_id }}</p>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 49 49" role="img" aria-label="QR ورود بازی میز" shape-rendering="crispEdges">
<rect width="49" height="49" fill="white"/><path d="{{ $path }}" fill="black"/></svg>
<p>اسکن کن و وارد بازی شو</p><p dir="ltr">{{ $link }}</p>
<p class="screen">برای چاپ از گزینه Print مرورگر استفاده کنید.</p></main>
<p class="screen"><a href="{{ route('cashier.tables') }}">بازگشت</a></p></body></html>
