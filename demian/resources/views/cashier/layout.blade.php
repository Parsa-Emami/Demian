<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="referrer" content="no-referrer">
  <title>@yield('title', 'پنل صندوق‌دار دمیان')</title>
  <style>
    :root{font-family:Tahoma,'Segoe UI',sans-serif;color-scheme:dark;background:#101519;color:#f5f4ed}
    *{box-sizing:border-box}body{margin:0;min-height:100dvh;background:radial-gradient(ellipse at top,#213137,#101519 65%)}
    a{color:#e0bf86}header{border-bottom:1px solid #3b4646;padding:16px 4vw;background:#0f1a1bc9}
    header .wrap{max-width:850px;margin:auto;display:flex;justify-content:space-between;align-items:center;gap:12px}
    main{max-width:850px;margin:35px auto;padding:0 20px 56px}.brand{font-size:1.25rem;font-weight:800}
    .muted{color:#bfc8c7;font-size:.94rem}.panel{background:#1b2729;border:1px solid #374345;border-radius:18px;padding:26px;margin:16px 0;box-shadow:0 16px 40px #080f1040}
    h1{font-size:1.7rem;margin:0 0 14px}h2{font-size:1.2rem;margin:0 0 14px}
    label{display:block;font-weight:700;margin:16px 0 6px}input{display:block;width:100%;border:1px solid #5b686a;border-radius:11px;background:#0e191b;color:#fff;padding:15px;font:inherit;direction:ltr;text-align:left}
    input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #e9ba72;outline-offset:3px}
    button,.button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;border:0;border-radius:10px;padding:12px 20px;background:#e7bb7a;color:#19201e;font-weight:800;font-size:1rem;cursor:pointer;text-decoration:none}
    button.secondary,.button.secondary{background:#304347;color:#f5f4ed}.row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .alert{background:#442424;border:1px solid #9e5e5e;border-radius:10px;padding:12px;margin:12px 0}
    .ok{background:#1d4035;border:1px solid #488b70;border-radius:12px;padding:16px;margin:16px 0}
    .pill{display:inline-block;border:1px solid #7f966e;border-radius:50px;padding:6px 14px;color:#d9e7c7}
    .big{font-size:3rem;font-weight:900;color:#f4d19d;margin:12px 0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:18px 0}
    .card{padding:18px;border:1px solid #394b4b;border-radius:12px;background:#152123}
    .card strong{display:block;font-size:1.15rem;margin-top:6px;direction:ltr;text-align:right}
    .check{display:flex;align-items:center;gap:10px;margin:18px 0}.check input{width:20px;height:20px}
    table{width:100%;border-collapse:collapse;display:block;overflow-x:auto;white-space:nowrap}th,td{padding:12px 14px;border-bottom:1px solid #344447;text-align:right}
    .logout{margin:0}small{line-height:1.7}
    @media(max-width:520px){main{margin:20px auto}.panel{padding:18px}.big{font-size:2.4rem}}
  </style>
</head>
<body>
<header><div class="wrap"><span class="brand">دمیان | پنل کافه</span>
  @isset($staff)
  <div class="row"><span class="muted">{{ $staff->display_name }} · {{ $staff->branch_id }}</span>
  <form class="logout" method="post" action="{{ route('cashier.logout') }}">@csrf<button type="submit" class="secondary">خروج امن</button></form></div>
  @endisset
</div></header>
<main>
  @yield('content')
  <p class="muted"><small>هر کد فقط یک بار قابل استفاده است. کد مشتری را در پیام‌رسان یا گروه عمومی منتشر نکنید. مبلغ را مطابق واحد پولی ثبت‌شده روی کد وارد کنید.</small></p>
</main>
</body>
</html>
