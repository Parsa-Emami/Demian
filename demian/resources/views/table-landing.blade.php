<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow">
<title>بازی دمیان | میز {{ $label }}</title>
<style>body{margin:0;padding:24px;background:#101519;color:#f5f4ed;font-family:Tahoma,Arial,sans-serif;min-height:90vh;display:grid;place-items:center}main{max-width:420px;text-align:center}button{background:#e7bb7a;color:#19201e;font:inherit;font-weight:bold;min-height:48px;border:0;border-radius:12px;padding:12px 28px;cursor:pointer}button:focus-visible{outline:3px solid white;outline-offset:4px}p{line-height:1.9}</style></head>
<body><main><h1>DEMIAN</h1><h2>میز {{ $label }}</h2><p>به بازی دمیان خوش آمدید.</p><p>با انتخاب ورود، یک شمارش تجمیعی برای این میز ثبت می‌شود. این کد جایزه یا تخفیف اختصاص نمی‌دهد.</p>
<form method="post" action="{{ route('table.launch',$code,false) }}">@csrf<input type="hidden" name="nonce" value="{{ $nonce }}"><button type="submit">ورود به بازی</button></form>
</main></body></html>
