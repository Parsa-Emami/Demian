<!DOCTYPE html>
<html lang="fa" dir="rtl" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    >
    <meta name="theme-color" content="#111b19">
    <meta name="demian-static-release" content="false">
    <meta name="demian-ops-client" content="off">
    <!-- Server response headers, not HTML meta tags, control production caching. -->
    {{-- <meta name="screen-orientation" content="landscape">
    <meta name="x5-orientation" content="landscape">
    <meta name="full-screen" content="yes">
    <meta name="x5-fullscreen" content="true"> --}}
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="icon" type="image/png" sizes="192x192" href="icons/demian-192.png">
    <link rel="apple-touch-icon" href="icons/demian-192.png">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="demian-arcade-api" content="{{ url('/api/v1/arcade') }}">

    <link rel="preload" as="image" href="assets/environments/cafe-runner-v1/wordmark.png" fetchpriority="high">

    <title>Demian Game Platform · Café Game Room</title>
    <meta name="author" content="Parsa Emami — پارسا امامی">
    <meta name="description" content="دمیان؛ مجموعه بازی‌های کافه‌ای در مرورگر، طراحی و توسعه توسط پارسا امامی، مهندس نرم‌افزار. Demian games by Parsa Emami.">
    <link rel="author" href="https://parsaaemm.dev/">
    <link rel="alternate" type="application/json" href="game-info.json" title="Demian creator information">
@verbatim
    <script type="application/ld+json" id="demian-project-schema">{
  "@context": "https://schema.org",
  "@type": "VideoGame",
  "@id": "./#demian",
  "name": "Demian",
  "alternateName": "دمیان",
  "url": "./",
  "inLanguage": [
    "fa",
    "en"
  ],
  "creator": {
    "@type": "Person",
    "@id": "https://parsaaemm.dev/#person",
    "name": "Parsa Emami",
    "alternateName": "پارسا امامی",
    "url": "https://parsaaemm.dev/",
    "jobTitle": "Software Engineer",
    "sameAs": [
      "https://github.com/Parsa-Emami",
      "https://www.linkedin.com/in/parsaaemm/"
    ]
  },
  "author": {
    "@id": "https://parsaaemm.dev/#person"
  },
  "creditText": "Game design and software development: Parsa Emami / پارسا امامی.",
  "description": "Demian is a browser-based cafe game platform, including Coffee Crash, designed and developed by Parsa Emami (parsaaemm).",
  "genre": [
    "Casual",
    "Puzzle"
  ],
  "gamePlatform": [
    "Web browser",
    "Mobile browser"
  ],
  "sameAs": [
    "https://github.com/Parsa-Emami/Demian"
  ],
  "hasPart": {
    "@type": "VideoGame",
    "name": "Coffee Crash",
    "alternateName": "جورچین قهوه",
    "creator": {
      "@id": "https://parsaaemm.dev/#person"
    }
  }
}</script>
@endverbatim


    <script>
        (() => {
            // This executes before Vite: a failed initial import needs a manual
            // recovery UI, without ever silently restarting a ranked session.
            const chunkFailure = /(?:dynamically imported module|importing a module script|chunkloaderror|loading chunk|\/build\/assets\/.*\.js)/i;
            const present = reason => {
                const message = String(reason?.message ?? reason?.reason?.message ?? reason ?? '');
                if (!chunkFailure.test(message)) return;
                const mount = () => {
                    if (document.querySelector('[data-demian-chunk-recovery]')) return;
                    const panel = document.createElement('aside');
                    panel.dataset.demianChunkRecovery = 'true';
                    panel.setAttribute('role', 'alert');
                    panel.setAttribute('dir', 'rtl');
                    panel.style.cssText = 'position:fixed;inset:auto 12px 12px;z-index:2147483646;max-width:440px;margin-inline:auto;padding:16px;border-radius:12px;background:#202a21;color:#fff;box-shadow:0 6px 30px #0008;font:inherit';
                    const copy = document.createElement('p');
                    copy.textContent = 'فایل بازی دریافت نشد. اینترنت را بررسی کنید یا نسخهٔ جدید را دستی بارگذاری کنید.';
                    const reload = document.createElement('button');
                    reload.type = 'button';
                    reload.textContent = 'بارگذاری نسخهٔ جدید';
                    reload.style.cssText = 'margin-top:12px;padding:9px 14px;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;cursor:pointer';
                    reload.addEventListener('click', () => window.location.reload());
                    panel.append(copy, reload);
                    document.body.append(panel);
                };
                if (document.body) mount();
                else document.addEventListener('DOMContentLoaded', mount, { once: true });
            };
            window.addEventListener('vite:preloadError', event => {
                event.preventDefault();
                present(event.payload ?? event);
            });
            window.addEventListener('unhandledrejection', event => present(event.reason));
            window.addEventListener('error', event => present(event.error ?? event.message), true);
            window.addEventListener('demian:game-chunk-error', () => present({ message: 'loading chunk' }));
        })();
    </script>

    @vite([
        'resources/js/app.js',
    ])
</head>

<body class="min-h-full bg-[#050610] text-white">
    <main
        data-character-manager
        data-manager-shell
        data-ui-layer-root
        data-api-base="{{ route('characters.index') }}"
        data-event-api-base="{{ url('/api/v1/events') }}"
        data-sidebar-state="collapsed"
        data-mobile-actions="collapsed"
        data-runtime-version="14.0.0-mobile-runner"
        data-deployment-mode="versioned-chunks"
        data-session-state="booting"
        data-game-orientation="auto"
        data-shell-screen="boot"
        data-control-layout="none"
        data-hud-visible="true"
        data-hints-visible="true"
        data-interface-density="comfortable"
        class="manager-shell"
        dir="ltr"
    >
        <aside
            id="character-manager-sidebar"
            data-manager-sidebar
            data-ui-layer="sidebar"
            class="manager-sidebar"
            dir="rtl"
            aria-label="مدیریت کاراکترها"
        >
            <div class="mobile-sheet-handle" aria-hidden="true"></div>

            <button
                type="button"
                data-sidebar-toggle
                data-ui-layer="sidebar-control"
                class="sidebar-edge-toggle"
                aria-controls="character-manager-sidebar"
                aria-expanded="false"
                title="جمع‌کردن مدیریت کاراکترها (P)"
            >
                <span data-sidebar-toggle-icon aria-hidden="true">‹</span>
                <span class="sr-only" data-sidebar-toggle-label>جمع‌کردن</span>
            </button>

            <div class="manager-sidebar__scroll">
                <div class="sidebar-compact" aria-hidden="true">
                    <div class="sidebar-compact__logo">D</div>
                    <span class="sidebar-compact__active-dot"></span>
                    <span class="sidebar-compact__name">DEMIAN</span>
                    <span class="sidebar-compact__hint">M</span>
                </div>

                <div class="sidebar-expanded-content">
                    <button type="button" data-sidebar-toggle class="character-sheet-close" aria-label="بستن انتخاب کاراکتر">×</button>
                    <section class="arcade-panel manager-brand rounded-[28px] p-4">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="arcade-label">Demian mobile arcade engine</p>
                                <h1 class="arcade-title mt-2 text-3xl font-black" data-active-character-name>
                                    DARYA / دریا
                                </h1>
                                <p class="mt-1 text-xs text-zinc-400">
                                    کاراکترت را انتخاب کن؛ ماجراجویی از همین‌جا شروع می‌شود.
                                </p>
                                <p data-character-selection-live class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
                            </div>

                            <span class="arcade-badge">14</span>
                        </div>

                        <div class="mt-4 manager-brand__chip-row">
                            <span class="manager-chip manager-chip--pink">دریا + پیشی</span>
                            <span class="manager-chip manager-chip--cyan">حرکت دوبعدی</span>
                            <span class="manager-chip manager-chip--yellow">مخصوص موبایل</span>
                        </div>
                    </section>

                    <section class="arcade-panel mt-4 rounded-[28px] p-4">
                        <div class="character-selection__header">
                            <div>
                                <p class="arcade-label">Character manager</p>
                                <h2 class="mt-1 text-lg font-black">انتخاب کاراکتر</h2>
                            </div>

                        </div>

                        <div
                            data-character-list
                            class="character-selection-rail character-portrait-grid mt-4"
                            tabindex="0"
                            role="list"
                            aria-label="کاراکترهای قابل انتخاب"
                            aria-live="polite"
                        ></div>
                    </section>

                    <details class="arcade-panel manager-details mt-4 rounded-[28px] p-4">
                        <summary class="manager-details__summary">
                            <span>
                                <small class="arcade-label">Import character</small>
                                <strong>افزودن Sprite Sheet</strong>
                            </span>
                            <span aria-hidden="true">＋</span>
                        </summary>

                        <form
                            data-character-form
                            class="mt-4 grid gap-3"
                            enctype="multipart/form-data"
                        >
                            <label class="grid gap-1.5">
                                <span class="text-xs text-zinc-400">نام کاراکتر</span>
                                <input
                                    class="arcade-input"
                                    name="name"
                                    type="text"
                                    maxlength="80"
                                    required
                                    placeholder="مثلاً Nika"
                                >
                            </label>

                            <label class="grid gap-1.5">
                                <span class="text-xs text-zinc-400">Slug انگلیسی</span>
                                <input
                                    class="arcade-input"
                                    name="slug"
                                    type="text"
                                    maxlength="100"
                                    dir="ltr"
                                    placeholder="nika"
                                >
                            </label>

                            <label
                                data-drop-zone
                                class="arcade-drop-zone cursor-pointer p-3 text-center"
                            >
                                <input
                                    class="sr-only"
                                    name="sprite_sheet"
                                    type="file"
                                    accept="image/png,image/webp"
                                    required
                                >

                                <div class="grid place-items-center gap-2">
                                    <img
                                        data-sheet-preview
                                        class="max-h-28 max-w-full object-contain"
                                        alt=""
                                    >

                                    <div>
                                        <strong class="text-xs text-fuchsia-200">
                                            PNG / WEBP Sprite Sheet
                                        </strong>
                                        <p class="mt-1 text-[10px] text-zinc-500">
                                            فایل را رها یا انتخاب کن
                                        </p>
                                    </div>
                                </div>
                            </label>

                            <label class="grid gap-1.5">
                                <span class="text-xs text-zinc-400">Atlas JSON</span>
                                <input
                                    class="arcade-input text-xs"
                                    name="atlas"
                                    type="file"
                                    accept="application/json,.json"
                                    required
                                >
                            </label>

                            <input
                                name="settings"
                                type="hidden"
                                value='{"walk_speed":3.2,"run_speed":6.2,"jump_force":6.5,"scale":1}'
                            >

                            <p
                                data-form-error
                                class="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200"
                                hidden
                            ></p>

                            <button
                                data-character-submit
                                type="submit"
                                class="arcade-button w-full"
                            >
                                افزودن کاراکتر
                            </button>
                        </form>
                    </details>

                    <details class="arcade-panel manager-details mt-4 rounded-[28px] p-4">
                        <summary class="manager-details__summary">
                            <span>
                                <small class="arcade-label">Controls</small>
                                <strong>راهنمای کنترل‌ها</strong>
                            </span>
                            <span aria-hidden="true">＋</span>
                        </summary>

                        <ul class="mt-3 space-y-2 text-[11px] leading-6 text-zinc-400">
                            <li>• حرکت ۸ جهته با WASD، جهت‌ها یا جوی‌استیک لمسی.</li>
                            <li>• Shift برای دویدن؛ در موبایل جوی‌استیک تا انتها خودکار Sprint می‌شود.</li>
                            <li>• Space پرش جهت‌دار؛ جهت حرکت هنگام پرش حفظ می‌شود.</li>
                            <li>• E ضربه، J کمبو، K آپرکات، L جادو، X دش و U جاخالی.</li>
                            <li>• C رقص، V دست‌تکان‌دادن، Z چرخش و H جمله تصادفی.</li>
                            <li>• F تغییر نما، R تمرکز، M پنل و Pinch برای زوم موبایل.</li>
                        </ul>
                    </details>
                </div>
            </div>
        </aside>

        <button
            type="button"
            data-sidebar-backdrop
            data-ui-layer="sidebar-backdrop"
            class="manager-sidebar-backdrop"
            aria-label="بستن مدیریت کاراکترها"
            aria-hidden="true"
            tabindex="-1"
        ></button>

        <section class="manager-stage" data-ui-layer="stage" dir="rtl">
            <div class="arcade-screen-bezel" data-ui-layer="stage-effect" aria-hidden="true"></div>
            <div data-demian-scene data-ui-layer="canvas" class="demian-scene absolute inset-0"></div>


            <div data-game-shell data-ui-layer="shell" class="game-shell absolute inset-0" dir="rtl">
                <div data-shell-toast-host data-ui-layer="shell-toast" class="shell-toast-host" aria-live="polite" aria-atomic="false"></div>
                <p data-shell-network-status class="shell-network-status" role="status" aria-live="polite" hidden></p>
                 <p data-shell-announcer class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>

                <section
                    data-screen="boot"
                    class="shell-screen shell-screen--boot"
                    aria-label="راه‌اندازی دمیان"
                >
                    <div class="boot-console">
                        <img class="boot-console__logo" src="assets/environments/cafe-runner-v1/wordmark.png" width="1637" height="553" alt="دمیان · DEMIAN" fetchpriority="high" decoding="async">
                        <h1 class="sr-only">کافه دمیان</h1>
                        <p data-boot-message class="boot-console__message">در حال راه‌اندازی هسته‌ی دمیان…</p>
                        <div data-boot-progress-bar class="shell-progress shell-progress--boot" role="progressbar" aria-label="پیشرفت بارگذاری دمیان" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                            <span></span>
                        </div>
                        <div class="boot-console__meta">
                            <span data-boot-progress-value>0%</span>
                            <span>به کافهٔ دمیان خوش آمدی</span>
                        </div>
                    </div>
                </section>

                <section
                    data-screen="cafe-menu"
                    class="shell-screen shell-screen--cafe"
                    aria-label="منوی اصلی کافه دمیان"
                    aria-hidden="true"
                    hidden
                >
                    <div class="cafe-menu__ambient" aria-hidden="true">
                        <span></span><span></span><span></span>
                    </div>
                    <div class="cafe-menu__content">
                        <div data-menu-reveal>
                            <p class="shell-kicker">به دمیان خوش آمدی</p>
                            <h1 class="cafe-menu__title"><b>DEMIAN</b></h1>
                        </div>
                        <button type="button" data-sidebar-toggle class="cafe-menu__showcase" aria-label="نمایش مجموعه و انتخاب کاراکتر">
                            <span class="cafe-menu__showcase-copy">
                                <span class="cafe-menu__showcase-kicker">YOUR CAST</span>
                                <strong>قهرمان این داستان تویی</strong>
                                <small>شخصیتت را انتخاب کن و وارد کافه شو</small>
                            </span>
                            <span class="cafe-menu__portraits" aria-hidden="true">
                                <span class="cafe-menu__portrait cafe-menu__portrait--darya"><img src="assets/characters/darya/darya-preview-v14.png" alt="" width="128" height="128" loading="lazy" decoding="async" fetchpriority="low"></span>
                                <span class="cafe-menu__portrait cafe-menu__portrait--negar"><img src="assets/characters/negar/negar-preview-v14.png" alt="" width="128" height="128" loading="lazy" decoding="async" fetchpriority="low"></span>
                                <span class="cafe-menu__portrait cafe-menu__portrait--tiam"><img src="assets/characters/tiam/tiam-preview-v14.png" alt="" width="128" height="128" loading="lazy" decoding="async" fetchpriority="low"></span>
                            </span>
                        </button>
                        <div data-menu-reveal class="cafe-menu__actions">
                            <button type="button" data-shell-action="play" data-screen-autofocus class="shell-button shell-button--primary">
                                <span>انتخاب بازی</span><b aria-hidden="true">←</b>
                            </button>
                            <button type="button" data-shell-action="continue" class="shell-button">
                                <span>ورود سریع به Open World</span><b aria-hidden="true">▶</b>
                            </button>
                            <button type="button" data-shell-action="settings" class="shell-button shell-button--ghost">
                                <span>تنظیمات</span><b aria-hidden="true">⚙</b>
                            </button>
                            <button type="button" data-shell-action="leaderboard" class="shell-button shell-button--ghost">لیدربورد هفتگی <b aria-hidden="true">♛</b></button>
                            <button type="button" data-shell-action="rewards" class="shell-button shell-button--ghost">تخفیف‌های من <b aria-hidden="true">٪</b></button>
                        </div>
                        <button type="button" data-sidebar-toggle class="shell-button shell-button--ghost menu-character-button">انتخاب کاراکتر <span aria-hidden="true">◉</span></button>
                        <nav class="demian-legal-links" aria-label="قوانین و حریم خصوصی">
                            <a href="privacy/" target="_self">حریم خصوصی</a>
                            <a href="terms/" target="_self">شرایط استفاده</a>
                            <a href="competition-rules/" target="_self">قوانین رقابت و جوایز</a>
                        </nav>
                        <div class="demian-credit" data-project-credit>
                            <p>طراحی و توسعهٔ بازی</p>
                            <a href="https://parsaaemm.dev/" target="_blank" rel="noopener noreferrer" lang="en" dir="ltr" data-creator-link>parsaaemm</a>
                        </div>
                    </div>
                    <aside class="cafe-menu__cabinet" aria-hidden="true">
                        <div class="cafe-cabinet__sign">NOW PLAYING</div>
                        <div class="cafe-cabinet__screen">
                            <span>GAME</span><b>LIBRARY</b><small>CHOOSE YOUR GAME</small>
                        </div>
                        <div class="cafe-cabinet__controls"><i></i><i></i><i></i></div>
                    </aside>
                </section>

                <section data-screen="motion-comparison" class="shell-screen shell-screen--modal motion-lab" role="dialog" aria-modal="true" aria-labelledby="motion-lab-title" aria-hidden="true" hidden>
                    <div class="motion-lab__panel">
                        <header class="motion-lab__header">
                            <div><p class="shell-kicker">DEMIAN / MOTION STUDIO</p><h2 id="motion-lab-title">الگوی مادر حرکت</h2><p>تصویر فعلی شخصیت‌ها را کنار الگوی مفصلی مشترک ببین؛ اعضای هر خانواده با یک فاز حرکت می‌کنند.</p></div>
                            <button type="button" data-shell-action="close-modal" class="shell-button shell-button--ghost" data-screen-autofocus aria-label="بستن مقایسهٔ حرکت">بستن</button>
                        </header>
                        <div class="motion-lab__toolbar">
                            <label>حرکت<select data-motion-state><option value="idle">ایستادن</option><option value="walk">راه‌رفتن</option><option value="run" selected>دویدن</option><option value="sprint">دویدن سریع</option><option value="takeoff">بلندشدن</option><option value="jump">اوج پرش</option><option value="fall">فرود هوایی</option><option value="land">تماس با زمین</option><option value="slide">اسلاید</option></select></label>
                            <label>جهت<select data-motion-facing><option value="1">راست</option><option value="-1">چپ</option></select></label>
                            <label>سرعت <output data-motion-speed-value>6.0</output><input data-motion-speed type="range" min="0" max="9" step="0.1" value="6" aria-label="سرعت مقایسه"></label>
                            <button type="button" data-motion-toggle class="shell-button">توقف حرکت</button>
                            <button type="button" data-motion-step class="shell-button shell-button--ghost">یک فریم جلو</button>
                            <button type="button" data-motion-reset class="shell-button shell-button--ghost">از ابتدا</button>
                            <button type="button" data-motion-winged class="shell-button shell-button--ghost">بال‌ها و همراه‌ها</button>
                        </div>
                        <label class="motion-lab__timeline">فاز مشترک <output data-motion-phase-value>0٪</output><input data-motion-phase type="range" min="0" max="99" step="1" value="0" aria-label="فاز مشترک حرکت"></label>
                        <div class="motion-lab__cards" data-motion-cards></div>
                        <p class="motion-lab__note">نقطهٔ طلایی یعنی تماس پا با زمین. تصویر فعلی هنوز از اطلس اختصاصی شخصیت است؛ الگوی مادر، مرجع انتقال هنری پس از بازبینی نمونه‌هاست.</p>
                        <details class="motion-lab__roster"><summary>خانوادهٔ حرکتی هر ۱۲ شخصیت</summary><p data-motion-roster></p></details>
                    </div>
                </section>

                <section
                    data-screen="game-selection"
                    class="shell-screen shell-screen--selection"
                    aria-label="انتخاب بازی"
                    aria-hidden="true"
                    hidden
                >
                    <div class="shell-page">
                        <header class="shell-page__header">
                            <div>
                                <p class="shell-kicker">CAFÉ DEMIAN / GAME LIBRARY</p>
                                <h2>یک بازی انتخاب کن</h2>
                                <p>کاوش آرام یا یک ران سریع؟ انتخاب با توست.</p>
                            </div>
                            <button type="button" data-shell-action="back-cafe" class="shell-icon-button" aria-label="بازگشت به منوی کافه">×</button>
                        </header>
                        <div class="game-library-toolbar">
                            <span class="game-library-toolbar__hint" data-game-library-count>۷ بازی برای انتخاب</span>
                            <div class="scroll-rail-controls" aria-label="پیمایش کتابخانه بازی">
                                <button type="button" data-game-scroll-previous class="scroll-rail-button" aria-label="بازی قبلی">›</button>
                                <output data-game-scroll-status class="scroll-rail-status" aria-live="polite">0 / 0</output>
                                <button type="button" data-game-scroll-next class="scroll-rail-button" aria-label="بازی بعدی">‹</button>
                            </div>
                        </div>
                        <div data-game-grid class="game-grid" tabindex="0" role="list" aria-label="کتابخانه بازی‌های دمیان"></div>
                        <footer class="shell-page__footer">
                            <span>بازی‌های تازه، قدم‌به‌قدم اضافه می‌شوند.</span>
                            <span>ESC · بازگشت</span>
                        </footer>
                    </div>
                </section>

                <section
                    data-screen="loading"
                    class="shell-screen shell-screen--loading"
                    aria-label="بارگذاری بازی"
                    aria-hidden="true"
                    hidden
                >
                    <div class="loading-console loading-experience" dir="rtl">
                        <div class="loading-experience__ambient" aria-hidden="true"></div>
                        <div class="loading-experience__orb" aria-hidden="true">
                            <span class="loading-experience__orb-ring"></span>
                            <span class="loading-experience__orb-core">D</span>
                            <span class="loading-experience__orb-spark"></span>
                        </div>
                        <p class="shell-kicker loading-experience__eyebrow">DEMIAN · GAME LOADING</p>
                        <h2 data-loading-title>OPEN WORLD</h2>
                        <p data-loading-step class="loading-experience__stage" role="status" aria-live="polite" aria-atomic="true">در حال آماده‌سازی بازی…</p>
                        <div class="loading-experience__track-head">
                            <span data-loading-phase>مرحلهٔ ۱ از ۴</span>
                            <span data-loading-progress-value>۰ / ۴</span>
                        </div>
                        <div data-loading-progress-bar class="shell-progress shell-progress--loading" role="progressbar" aria-label="پیشرفت چهار مرحلهٔ بارگذاری بازی" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="۰ از ۴ مرحله انجام شد"><span></span></div>
                        <div class="loading-experience__heartbeat" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
                        <div class="loading-experience__statusline">
                            <span data-loading-health>در حال بررسی منابع ضروری…</span>
                            <span data-loading-elapsed>۰ ثانیه</span>
                        </div>
                        <div class="loading-experience__tip">
                            <span class="loading-experience__tip-icon" aria-hidden="true">✦</span>
                            <p data-loading-tip-text>در حال آماده‌سازی بازی…</p>
                            <button type="button" data-loading-tip-next aria-label="نمایش نکتهٔ بعدی بارگذاری">نکتهٔ بعدی <span aria-hidden="true">↻</span></button>
                        </div>
                    </div>
                </section>

                <section
                    data-screen="pause"
                    class="shell-screen shell-screen--modal"
                    aria-label="توقف بازی"
                    aria-hidden="true"
                    hidden
                >
                    <div class="shell-modal pause-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">
                        <p class="shell-kicker">GAME PAUSED</p>
                        <h2 id="pause-title">توقف بازی</h2>
                        <p data-pause-game-title>DEMIAN GAME</p>
                        <div class="shell-modal__actions">
                            <button type="button" data-shell-action="resume" data-screen-autofocus class="shell-button shell-button--primary">ادامه‌ی بازی</button>
                            <button type="button" data-shell-action="restart" class="shell-button">شروع دوباره</button>
                            <button type="button" data-shell-action="settings" class="shell-button">تنظیمات</button>
                            <button type="button" data-shell-action="game-guide" class="shell-button" hidden>راهنما</button>
                            <button type="button" data-shell-action="exit-game" class="shell-button shell-button--danger">خروج به کافه</button>
                        </div>
                        <small>ESC برای ادامه</small>
                    </div>
                </section>

                <section
                    data-screen="settings"
                    class="shell-screen shell-screen--modal"
                    aria-label="تنظیمات"
                    aria-hidden="true"
                    hidden
                >
                    <div class="shell-modal settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
                        <header class="shell-modal__header">
                            <div><p class="shell-kicker">PLATFORM SETTINGS</p><h2 id="settings-title">تنظیمات</h2></div>
                            <button type="button" data-shell-action="close-modal" class="shell-icon-button" aria-label="بستن تنظیمات">×</button>
                        </header>
                        <form data-settings-form class="settings-form">
                            <label class="settings-field">
                                <span><b>کیفیت تصویر</b><small>وضوح صحنه و میزان جزئیات را در همهٔ بازی‌ها تنظیم می‌کند.</small></span>
                                <select name="quality">
                                    <option value="auto">خودکار · متناسب با گوشی</option>
                                    <option value="performance">سبک · مصرف کمتر</option>
                                    <option value="balanced">متعادل</option>
                                    <option value="high">جزئیات بیشتر</option>
                                </select>
                            </label>
                            <label class="settings-field">
                                <span><b>نرخ فریم تصویر</b><small>۳۰ فریم برای مصرف کمتر و ۶۰ فریم برای حرکت روان‌تر.</small></span>
                                <select name="frameRate">
                                    <option value="auto">خودکار</option>
                                    <option value="30">تا ۳۰ فریم</option>
                                    <option value="60">تا ۶۰ فریم</option>
                                </select>
                            </label>
                            <label class="settings-field">
                                <span><b>حرکت رابط</b><small>هماهنگ با prefers-reduced-motion و Anime.js.</small></span>
                                <select name="motion">
                                    <option value="system">تنظیم سیستم</option>
                                    <option value="full">کامل</option>
                                    <option value="reduced">کاهش‌یافته</option>
                                </select>
                            </label>
                            <label class="settings-field">
                                <span><b>تراکم رابط</b><small>اندازه‌ی پنل‌ها و فاصله‌ها.</small></span>
                                <select name="interfaceDensity">
                                    <option value="comfortable">راحت</option>
                                    <option value="compact">فشرده</option>
                                </select>
                            </label>
                            <label class="settings-field">
                                <span><b>اندازهٔ نوشته‌های بازی</b><small>متن اطلاعات، هشدارها و پنل‌های داخل بازی.</small></span>
                                <select name="hudScale">
                                    <option value="standard">استاندارد</option>
                                    <option value="large">بزرگ</option>
                                    <option value="extra">خیلی بزرگ</option>
                                </select>
                            </label>
                            <label class="settings-field">
                                <span><b>کنتراست اطلاعات بازی</b><small>خوانایی پنل‌ها روی صحنه‌های روشن و تاریک.</small></span>
                                <select name="hudContrast">
                                    <option value="standard">استاندارد</option>
                                    <option value="high">زیاد</option>
                                </select>
                            </label>
                            <div class="settings-toggle-grid">
                                <label><input type="checkbox" name="hudVisible"><span>نمایش HUD</span></label>
                                <label><input type="checkbox" name="hintsVisible"><span>نمایش راهنما</span></label>
                                <label><input type="checkbox" name="soundEnabled"><span>افکت صوتی (SFX)</span></label>
                                <label><input type="checkbox" name="musicEnabled"><span>موسیقی پس‌زمینه</span></label>
                            </div>
                            <p class="settings-audio-explainer">موسیقی و افکت‌ها مستقل تنظیم می‌شوند. صدا فقط بعد از لمس یا فشردن کلید فعال می‌شود و هنگام Pause یا خروج قطع خواهد شد.</p>
                            <details data-touch-settings class="control-settings touch-settings">
                                <summary>جوی‌استیک و کنترل لمسی</summary>
                                <p>پیش‌نمایش زنده است. برای اعمال چیدمان در بازی، تنظیمات را ذخیره کن.</p>
                                <div data-touch-preview data-ui-layer="local-control" class="touch-preview" aria-hidden="true" dir="ltr">
                                    <span class="touch-preview__stick">✦</span>
                                    <span class="touch-preview__actions"><i>پرش</i><i>تعامل</i></span>
                                </div>
                                <div class="touch-settings__fields">
                                    <label><span>نوع جوی‌استیک</span><select name="touchStickMode"><option value="fixed">ثابت</option><option value="floating">شناور</option></select></label>
                                    <label><span>چیدمان</span><select name="touchHand"><option value="right">راست‌دست</option><option value="left">چپ‌دست</option></select></label>
                                    <label><span>نمایش روی صفحه</span><select name="touchVisibility"><option value="auto">خودکار</option><option value="always">همیشه</option><option value="hidden">پنهان</option></select></label>
                                    <label><span>روش دویدن</span><select name="touchRunMode"><option value="hold">نگه‌داشتن</option><option value="toggle">ضربه برای تغییر وضعیت</option></select></label>
                                    <label><span>روش اسلاید در رانر</span><select name="touchSlideMode"><option value="hold">نگه‌داشتن</option><option value="toggle">ضربه برای تغییر وضعیت</option></select></label>
                                    <label class="touch-settings__range"><span>اندازهٔ جوی‌استیک</span><input type="range" name="touchStickSize" min="80" max="120" value="100" dir="ltr"><output dir="ltr" aria-hidden="true">100</output></label>
                                    <label class="touch-settings__range"><span>اندازهٔ دکمه‌ها</span><input type="range" name="touchButtonSize" min="90" max="120" value="100" dir="ltr"><output dir="ltr" aria-hidden="true">100</output></label>
                                    <label class="touch-settings__range"><span>شفافیت کنترل‌ها</span><input type="range" name="touchOpacity" min="55" max="100" value="100" dir="ltr"><output dir="ltr" aria-hidden="true">100</output></label>
                                    <label class="touch-settings__range"><span>حساسیت جوی‌استیک</span><input type="range" name="touchSensitivity" min="60" max="160" value="100" dir="ltr"><output dir="ltr" aria-hidden="true">100</output></label>
                                    <label class="touch-settings__range"><span>ناحیهٔ بی‌اثر مرکز استیک</span><input type="range" name="touchDeadZone" min="0" max="30" value="10" dir="ltr"><output dir="ltr" aria-hidden="true">10</output></label>
                                    <label class="touch-settings__range"><span>فاصلهٔ استیک از کناره</span><input type="range" name="touchStickInset" min="0" max="32" value="0" dir="ltr"><output dir="ltr" aria-hidden="true">0</output></label>
                                    <label class="touch-settings__range"><span>فاصلهٔ دکمه‌ها از کناره</span><input type="range" name="touchButtonInset" min="0" max="32" value="0" dir="ltr"><output dir="ltr" aria-hidden="true">0</output></label>
                                    <label class="touch-settings__range"><span>فاصلهٔ استیک از پایین</span><input type="range" name="touchStickLift" min="0" max="64" value="0" dir="ltr"><output dir="ltr" aria-hidden="true">0</output></label>
                                    <label class="touch-settings__range"><span>فاصلهٔ دکمه‌ها از پایین</span><input type="range" name="touchButtonLift" min="0" max="64" value="0" dir="ltr"><output dir="ltr" aria-hidden="true">0</output></label>
                                </div>
                                <div class="touch-settings__switches">
                                    <label><input type="checkbox" name="touchAutoSprint" checked> دویدن خودکار در کافه، در حالت نگه‌داشتن</label>
                                    <label><input type="checkbox" name="touchHaptics" checked> لرزش لمس در دستگاه‌های سازگار</label>
                                </div>
                            </details>
                            <details data-control-bindings class="control-settings">
                                <summary>کنترل‌ها و تغییر کلیدها</summary>
                                <p>کلید هر اکشن را انتخاب کن و کلید تازه را بزن. تغییرات همان لحظه ذخیره می‌شوند.</p>
                                <div data-binding-list class="control-binding-list"></div>
                                <p data-binding-status role="status" class="control-binding-status">کلیدهای جهت همیشه برای حرکت در دسترس‌اند.</p>
                                <button type="button" data-bind-reset class="shell-button shell-button--ghost">بازنشانی کلیدها</button>
                                <p class="gamepad-guide">دسته: آنالوگ چپ حرکت · A پرش · X دش · B جاخالی · L3 اسلاید · RB دویدن · Y تعامل · LB توانایی · LT سلام · RT شادی · R3 گفتگو · View نقشه · Menu توقف. در منو: جهت‌ها جابه‌جایی، A انتخاب و B بازگشت.</p>
                            </details>
                            <div class="shell-modal__actions shell-modal__actions--row">
                                <button type="submit" data-screen-autofocus class="shell-button shell-button--primary">ذخیره تنظیمات</button>
                                <button type="button" data-shell-action="reset-settings" class="shell-button shell-button--ghost">پیش‌فرض</button>
                            </div>
                        </form>
                        <section data-player-identity-panel class="player-identity-panel" dir="rtl"
                            aria-label="تأیید هویت و شماره تلفن">
                            <h3>هویت بازیکن و تأیید شماره</h3>
                            <p data-player-identity-status role="status" aria-live="polite">
                                وضعیت هویت از سرور دریافت می‌شود.
                            </p>
                            <button type="button" data-player-otp-send class="shell-button shell-button--ghost" hidden>ارسال کد پیامکی</button>
                            <form data-player-otp-form autocomplete="one-time-code" hidden>
                                <label for="player-otp-code">کد شش‌رقمی پیامک</label>
                                <input id="player-otp-code" name="code" class="arcade-input" type="text"
                                    inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6"
                                    autocomplete="one-time-code" required>
                                <button type="submit" class="shell-button shell-button--primary">تأیید شماره</button>
                            </form>
                            <small>رکوردهای تمرینی معتبر مالی نیستند. تأیید شماره هم به معنی صدور خودکار کوپن نیست.</small>
                        </section>
                    </div>
                </section>

                <section data-screen="leaderboard" class="shell-screen shell-screen--modal" role="dialog" aria-modal="true" aria-labelledby="ranking-title" aria-hidden="true" hidden>
                    <div class="shell-modal ranking-panel">
                        <p class="shell-kicker">DEMIAN · RECORDS</p>
                        <h2 id="ranking-title">لیدربورد کافه</h2>
                        <label>انتخاب بازی
                            <select data-ranking-game aria-label="بازی رقابتی">
                                <option value="all-games">رتبه‌بندی مشترک · همه بازی‌ها</option>
                                <option value="dino-run">Dino Run</option>
                                <option value="cafe-critters">Café Critters</option>
                                <option value="coffee-crash">Coffee Crash</option>
                                <option value="cafe-drift">Café Drift</option>
                                <option value="after-hours">After Hours</option>
                                <option value="cafe-rush">Café Rush</option>
                                <option value="open-world">Open World</option>
                            </select>
                        </label>
                        <label>بازهٔ رکوردها
                            <select data-ranking-period><option value="weekly">این هفته</option><option value="daily">امروز</option><option value="all">همیشه</option><option value="device">این دستگاه</option></select>
                        </label>
                        <label data-ranking-week-wrap hidden>آرشیو مسابقات تهران
                            <select data-ranking-week aria-label="انتخاب شنبه شروع هفته">
                                <option value="">هفته جاری</option>
                            </select>
                        </label>
                        <p data-ranking-status role="status" aria-live="polite"></p>
                        <p class="ranking-panel__countdown" data-ranking-countdown role="timer" aria-live="off" hidden></p>
                        <p data-ranking-personal-best aria-live="polite"></p>
                        <p class="ranking-panel__refresh-info" data-ranking-info>جدول مشترک از بهترین رکورد تأییدشده هر بازیکن ساخته می‌شود. رتبه‌های هفته جاری موقت و غیرمالی‌اند؛ پس از تسویه آرشیو می‌شوند. تازه‌سازی هر ۶۰ ثانیه.</p>
                        <div class="ranking-panel__scroll"><table><thead><tr><th scope="col">رتبه</th><th scope="col">بازیکن</th><th scope="col" data-ranking-score-heading>امتیاز استاندارد</th><th scope="col" data-ranking-game-heading>بازی / اعتبار</th></tr></thead><tbody data-ranking-rows></tbody></table></div>
                        <form data-ranking-name-form><label for="ranking-name">نام نمایشی</label><div><input id="ranking-name" name="display_name" minlength="2" maxlength="32" required autocomplete="nickname"><button type="submit" class="shell-button">ذخیره</button></div></form>
                        <button type="button" data-shell-action="rewards" class="shell-button shell-button--ghost">مشاهده صفحه اختصاصی کدهای تخفیف من</button>
                        <div data-ranking-recovery>
                            <p>بازیابی حساب روی دستگاه دیگر (فقط با کد یک‌بارمصرف؛ بدون شمارهٔ تلفن)</p>
                            <button type="button" data-ranking-issue-recovery class="shell-button shell-button--ghost">ساخت لینک بازیابی یک‌بارمصرف</button>
                            <label for="ranking-recovery-link">این لینک به حساب شما دسترسی می‌دهد؛ فقط نزد خودتان نگه دارید.
                                <input id="ranking-recovery-link" data-ranking-recovery-link type="text" readonly autocomplete="off" spellcheck="false">
                            </label>
                            <p>برای بازیابی پس از بستن مرورگر، یک کد پشتیبان بلندمدت بساز و در مدیر رمز عبور یا محل امن خارج از بازی نگهدار. کد فقط یک بار مصرف می‌شود.</p>
                            <button type="button" data-ranking-issue-backup class="shell-button shell-button--ghost">ساخت کد پشتیبان حساب</button>
                            <label for="ranking-backup-code">کد پشتیبان (فقط اکنون نمایش داده می‌شود)
                                <input id="ranking-backup-code" data-ranking-backup-code type="text" readonly autocomplete="off" spellcheck="false">
                            </label>
                            <form data-ranking-recover-form>
                                <label for="ranking-recovery-code">کد بازیابی ذخیره‌شده یا دریافت‌شده از لینک
                                    <input id="ranking-recovery-code" name="recovery_code" type="password" minlength="64" maxlength="64" required autocomplete="off" spellcheck="false">
                                </label>
                                <button type="submit" class="shell-button">بازیابی حساب</button>
                            </form>
                            <p data-ranking-recovery-status role="status" aria-live="polite"></p>
                            <button type="button" data-ranking-export-account class="shell-button shell-button--ghost">دریافت اطلاعات حساب</button>
                            <button type="button" data-ranking-delete-account class="shell-button shell-button--ghost">حذف کامل حساب و رکوردهای سرور</button>
                        </div>
                        <button type="button" data-shell-action="close-modal" class="shell-button shell-button--primary" data-screen-autofocus>بستن</button>
                    </div>
                </section>

                <section data-screen="coupon-wallet" class="shell-screen shell-screen--modal"
                    role="dialog" aria-modal="true" aria-labelledby="coupon-wallet-title"
                    aria-hidden="true" hidden>
                    <div class="shell-modal coupon-wallet-panel">
                        <p class="shell-kicker">DEMIAN · MY REWARDS</p>
                        <h2 id="coupon-wallet-title">کدهای تخفیف من</h2>
                        <p data-wallet-status role="status" aria-live="polite"></p>
                        <div data-wallet-restore-hint hidden>
                            <button type="button" data-shell-action="wallet-to-leaderboard" class="shell-button shell-button--ghost">بازیابی حساب</button>
                        </div>
                        <ul class="coupon-wallet-list" data-wallet-list aria-label="کدهای تخفیف حساب شما"></ul>
                        <div class="shell-modal__actions shell-modal__actions--row">
                            <button type="button" data-wallet-refresh
                                class="shell-button shell-button--ghost">به‌روزرسانی کدها</button>
                            <button type="button" data-shell-action="close-modal"
                                class="shell-button shell-button--primary" data-screen-autofocus>بستن</button>
                        </div>
                    </div>
                </section>

                <section
                    data-screen="results"
                    class="shell-screen shell-screen--results"
                    aria-label="نتیجه بازی"
                    aria-hidden="true"
                    hidden
                >
                    <div class="results-panel">
                        <p class="shell-kicker">پایان بازی</p>
                        <h2 data-results-title>نتیجه‌ی بازی</h2>
                        <p data-results-subtitle>مرحله به پایان رسید.</p>
                        <div class="results-panel__score"><small data-results-score-label>امتیاز</small><strong data-results-score>0</strong></div>
                        <p data-results-record-note class="results-record-note" role="note">نمایش نتیجه به معنی تأیید آنلاین نیست.</p>
                        <div data-results-stats class="results-panel__stats"></div>
                        <p data-results-ranking role="status" aria-live="polite"></p>
                        <p data-results-reward-note class="results-reward-note" role="note">کوپن فقط پس از تأیید سرور و تخصیص رسمی ایجاد می‌شود.</p>
                        <button type="button" data-shell-action="retry-ranking" data-results-ranking-retry class="shell-button" hidden>تلاش دوباره برای ثبت آنلاین</button>
                        <div class="shell-modal__actions shell-modal__actions--row">
                            <button type="button" data-shell-action="restart" class="shell-button shell-button--primary">تلاش دوباره</button>
                            <button type="button" data-shell-action="replay" data-results-replay class="shell-button" hidden>بازپخش</button>
                            <button type="button" data-shell-action="exit-game" class="shell-button">بازگشت به کافه</button>
                            <button type="button" data-shell-action="leaderboard" class="shell-button">لیدربورد</button>
                            <button type="button" data-shell-action="rewards" class="shell-button">تخفیف‌های من</button>
                        </div>
                    </div>
                </section>
            </div>

            <div data-game-feedback-host data-ui-layer="game-overlay" class="game-feedback-host" aria-hidden="true" inert></div>
            <div data-game-hud-host data-ui-layer="hud" class="game-hud-host"></div>
            <div data-game-prompt-host data-ui-layer="prompt" class="game-prompt-host"></div>
            <div data-game-overlay-host data-ui-layer="game-overlay" class="game-overlay-host"></div>

            <header data-gameplay-ui data-world-ui data-ui-layer="hud" class="stage-toolbar pointer-events-none absolute inset-x-0 top-0 p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="arcade-panel stage-toolbar__controls pointer-events-auto rounded-2xl p-2">
                        <div class="flex flex-wrap gap-2">
                            <button
                                type="button"
                                data-sidebar-toggle
                                class="arcade-button arcade-button--small stage-menu-button"
                                aria-controls="character-manager-sidebar"
                                aria-expanded="false"
                            >
                                <span data-sidebar-toggle-icon aria-hidden="true">☰</span>
                                <span data-sidebar-toggle-label>کاراکترها</span>
                            </button>

                            <button
                                type="button"
                                data-camera-reset
                                class="arcade-button arcade-button--small arcade-button--focus"
                                title="کاراکتر انتخاب‌شده را وسط تصویر قرار بده"
                            >
                                <span data-focus-character-label>تمرکز دریا</span>
                                <span class="desktop-key-hint">· R</span>
                            </button>

                            <button
                                type="button"
                                data-camera-toggle
                                class="arcade-button arcade-button--small arcade-button--cyan"
                            >
                                دنبال‌کردن کاراکتر · F
                            </button>

                            <button
                                type="button"
                                data-shell-action="menu"
                                class="arcade-button arcade-button--small"
                                title="بازگشت به کافه"
                            >
                                کافه
                            </button>

                            <button
                                type="button"
                                data-shell-action="pause"
                                class="arcade-button arcade-button--small"
                                title="توقف بازی (Esc)"
                            >
                                توقف
                            </button>

                            <button
                                type="button"
                                class="arcade-button arcade-button--small mobile-fullscreen-button"
                                aria-pressed="false"
                            >
                                <span aria-hidden="true">⛶</span>
                                <span data-fullscreen-label>تمام‌صفحه</span>
                            </button>
                        </div>
                    </div>

                    <div class="arcade-panel arcade-stage-brand pointer-events-auto rounded-[26px] px-5 py-4">
                        <div class="flex items-center gap-3">
                            <span class="arcade-live-dot" aria-hidden="true"></span>
                            <div>
                                <p class="arcade-label">Player one ready</p>
                                <h2 class="arcade-title mt-1 text-2xl font-black" data-active-character-name>
                                    DARYA / دریا
                                </h2>
                                <p class="mt-1 text-xs text-zinc-400">
                                    120-frame motion · Directional jump · Live NPCs
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div data-gameplay-ui data-world-ui data-hint-ui data-ui-layer="hud" class="arcade-intro-note pointer-events-none absolute left-1/2 top-28 -translate-x-1/2">
                جوی‌استیک را تا لبه ببر تا کاراکتر Sprint کند
            </div>

            <section data-gameplay-ui data-world-ui data-hud-ui data-ui-layer="hud" class="mobile-status-bar arcade-panel pointer-events-none absolute" aria-label="وضعیت بازی">
                <span class="mobile-status-bar__player" data-active-character-name>DARYA / دریا</span>
                <span class="mobile-status-chip"><small>STATE</small><b data-state-label>IDLE</b></span>
                <span class="mobile-status-chip"><small>SPD</small><b data-speed-label>0.00</b></span>
                <span class="mobile-status-chip"><small>NPC</small><b data-npc-label>2</b></span>
            </section>

            <section
                data-gameplay-ui data-world-ui data-hud-ui data-ui-layer="hud" class="hud-panel arcade-panel pointer-events-none absolute bottom-4 left-4 rounded-[24px] p-3"
            >
                <div class="grid grid-cols-2 gap-x-5 gap-y-2 text-[11px]">
                    <span class="text-zinc-500">STATE</span>
                    <strong data-state-label class="text-fuchsia-300">IDLE</strong>

                    <span class="text-zinc-500">SPEED</span>
                    <strong data-speed-label class="text-emerald-300">0.00</strong>

                    <span class="text-zinc-500">POSITION</span>
                    <strong data-position-label class="text-amber-300">0 / 0</strong>

                    <span class="text-zinc-500">VIEW</span>
                    <strong data-camera-label class="text-cyan-300">OVERVIEW</strong>

                    <span class="text-zinc-500">QUALITY</span>
                    <strong data-quality-label class="text-violet-300">AUTO</strong>

                    <span class="text-zinc-500">NPC</span>
                    <strong data-npc-label class="text-cyan-300">2</strong>
                </div>
            </section>

            <section
                data-gameplay-ui data-world-ui data-hint-ui data-ui-layer="hud" class="help-panel arcade-panel pointer-events-none absolute bottom-4 right-4 hidden rounded-[24px] p-3 text-left text-[10px] leading-5 text-zinc-400 lg:block"
                dir="ltr"
            >
                <div class="help-panel__grid">
                    <p><b class="text-white">WASD</b> 8-way move</p>
                    <p><b class="text-white" data-action-key="run">Shift</b> sprint</p>
                    <p><b class="text-white" data-action-key="jump">Space</b> jump</p>
                    <p><b class="text-white">↓ / G</b> slide</p>
                    <p><b class="text-white">O / V</b> celebrate / wave</p>
                    <p data-character-ability-hint hidden><b class="text-white" data-action-key="ability">Q</b> Smile Bloom</p>
                    <p><b class="text-white" data-action-key="speak">H</b> random speech</p>
                    <p><b class="text-white" data-action-key="interact">Enter</b> interact</p>
                    <p><b class="text-white">F / R</b> camera / focus</p>
                    <p><b class="text-white" data-action-key="toggleMap">M</b> world map</p>
                    <p><b class="text-white" data-action-key="quickSave">F6</b> quick save</p>
                    <p><b class="text-white">Wheel</b> zoom</p>
                </div>
            </section>

            <section data-gameplay-ui data-control-surface="world" data-ui-layer="controls" class="touch-controller absolute inset-x-0 bottom-0" dir="ltr" aria-label="کنترل‌های لمسی بازی">
                <div data-touch-stick-zone class="touch-stick-zone">
                    <div
                        data-virtual-stick
                        class="virtual-stick"
                        role="img"
                        aria-label="جوی‌استیک حرکت ۸ جهته"
                    >
                        <div class="virtual-stick__arrows" aria-hidden="true">
                            <span>▲</span><span>▶</span><span>▼</span><span>◀</span>
                        </div>
                        <div data-virtual-stick-knob class="virtual-stick__knob">
                            <span aria-hidden="true">✦</span>
                        </div>
                        <small class="virtual-stick__label">حرکت</small>
                    </div>
                </div>

                <output data-action-status class="character-action-status" aria-live="off" aria-label="وضعیت حرکت">آمادهٔ حرکت</output>
                <div class="touch-controller__right">
                    <div
                        id="mobile-action-tray"
                        data-mobile-actions-tray
                        class="mobile-action-tray"
                        aria-hidden="true"
                    >
                        <button type="button" data-input-press="dash" class="touch-action touch-action--mini touch-action--dash"><span>دش</span><kbd data-action-key="dash">X</kbd></button>
                        <button type="button" data-input-press="dodge" class="touch-action touch-action--mini"><span>جاخالی</span><kbd data-action-key="dodge">C</kbd></button>
                        <button type="button" data-input-press="slide" class="touch-action touch-action--mini"><span>اسلاید</span><kbd data-action-key="slide">G</kbd></button>
                        <button type="button" data-input-press="celebrate" class="touch-action touch-action--mini">شادی</button>
                        <button type="button" data-input-press="ability" data-character-ability hidden class="touch-action touch-action--mini" aria-label="ابیلیتی کاراکتر">شکوفهٔ لبخند</button>
                        <button type="button" data-input-press="speak" class="touch-action touch-action--mini touch-action--speak">گفتگو</button>
                        <button type="button" data-input-press="quickSave" class="touch-action touch-action--mini">ذخیره</button>
                    </div>

                    <div class="touch-controller__actions" aria-label="اکشن‌های اصلی">
                        <button type="button" data-input-press="interact" class="touch-action touch-action--interact touch-action--primary">
                            <span data-touch-interact-label>تعامل</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/></svg>
                        </button>
                        <button type="button" data-input-hold="run" class="touch-action touch-action--run">
                            <span>دویدن</span><small><span data-touch-hold>نگه‌دار</span><span data-touch-toggle>ضربه</span></small>
                        </button>
                        <button type="button" data-input-press="jump" data-input-hold="jumpHeld" class="touch-action touch-action--jump touch-action--primary">
                            <span>پرش</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6"/></svg>
                        </button>
                        <button type="button" data-input-press="wave" class="touch-action touch-action--emote touch-action--primary">
                            <span>سلام</span><small>✦</small>
                        </button>
                        <button
                            type="button"
                            data-mobile-actions-toggle
                            class="touch-action touch-action--more"
                            aria-controls="mobile-action-tray"
                            aria-expanded="false"
                        >
                            <span data-mobile-actions-label>اکشن‌ها</span><small>•••</small>
                        </button>
                    </div>
                </div>
            </section>

            <nav data-gameplay-ui data-ui-layer="controls" class="play-toolbar" aria-label="منوی بازی">
                <button type="button" data-shell-action="pause" aria-label="توقف بازی">Ⅱ</button>
                <button type="button" data-sidebar-toggle aria-label="انتخاب کاراکتر">◉ <span>کاراکتر</span></button>
                <button type="button" data-input-press="map" class="world-map-toggle" aria-label="نقشهٔ کافه">▦</button>
                <button type="button" data-mobile-fullscreen class="play-fullscreen" aria-label="تمام‌صفحه">⛶</button>
                <button type="button" data-shell-action="menu" aria-label="بازگشت به منو">⌂</button>
            </nav>
            <section data-gameplay-ui data-control-surface="dino-run" data-ui-layer="controls" class="runner-controls" dir="rtl" aria-label="کنترل‌های رانر">
                <button type="button" data-input-press="jump" data-input-hold="jumpHeld" class="runner-controls__jump"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6"/></svg><span>پرش</span><small>نگه‌دار: بلندتر</small></button>
                <button type="button" data-input-hold="duck" class="runner-controls__duck"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6"/></svg><span>اسلاید</span><small><span data-touch-hold>نگه‌دار</span><span data-touch-toggle>ضربه</span></small></button>
            </section>

            <div data-orientation-hint data-ui-layer="stage-system" class="orientation-hint" aria-hidden="true">
                <span aria-hidden="true">↻</span>
                <strong>حالت افقی بازی فعال است</strong>
            </div>
        </section>
    </main>

    <!-- Instant static-menu preview: runs during HTML parsing, before the
         deferred module bundle downloads/compiles. No network/API/art assets
         are fetched by this script and no game is simulated before hydration.
         Laravel dynamic pages continue to use the original boot screen. -->
    <script>
        (() => {
            if (document.querySelector('meta[name="demian-static-release"]')
                ?.getAttribute('content') !== 'true') return;
            const root = document.querySelector('[data-character-manager]');
            const menu = root?.querySelector('[data-screen="cafe-menu"]');
            const boot = root?.querySelector('[data-screen="boot"]');
            if (!root || !menu || !boot) return;

            // The real GameShell adopts this screen after its module is ready.
            // Visible navigation is not coupled to downloading the entire
            // game engine (or to any optional character image request).
            boot.hidden = true;
            boot.setAttribute('aria-hidden', 'true');
            menu.hidden = false;
            menu.setAttribute('aria-hidden', 'false');
            menu.inert = false;
            root.dataset.shellScreen = 'cafe-menu';
            root.dataset.instantMenu = 'true';
            const allowed = new Set(['play', 'continue', 'settings', 'leaderboard', 'rewards']);
            const capture = (event) => {
                if (root.dataset.instantMenu !== 'true') return;
                const button = event.target.closest?.('[data-shell-action]');
                const action = button?.dataset.shellAction;
                if (!menu.contains(button) || !allowed.has(action)) return;
                // The full event router is not yet installed. Preserve the
                // *first* action and give immediate loading feedback. Do not
                // fake that a game is loaded or replay extra clicks.
                event.preventDefault();
                event.stopImmediatePropagation();
                if (root.dataset.pendingMenuAction) return;
                root.dataset.pendingMenuAction = action;
                const status = document.createElement('p');
                status.setAttribute('role', 'status');
                status.dataset.instantMenuStatus = '';
                status.textContent = 'در حال آماده‌سازی بازی…';
                menu.querySelector('.cafe-menu__actions')?.append(status);
            };
            document.addEventListener('click', capture, true);
            document.addEventListener('demian:menu-hydrated', () => {
                document.removeEventListener('click', capture, true);
            }, { once: true });
        })();
    </script>
</body>
</html>
