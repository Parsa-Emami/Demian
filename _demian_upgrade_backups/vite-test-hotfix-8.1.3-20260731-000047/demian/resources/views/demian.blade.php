<!DOCTYPE html>
<html lang="fa" dir="rtl" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    >
    <meta name="theme-color" content="#050610">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <meta name="screen-orientation" content="landscape">
    <meta name="x5-orientation" content="landscape">
    <meta name="full-screen" content="yes">
    <meta name="x5-fullscreen" content="true">
    <link rel="manifest" href="manifest.webmanifest">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="csrf-token" content="{{ csrf_token() }}">

    <title>Demian Game Platform · Café Game Room</title>

    @vite([
        'resources/js/app.js',
    ])
</head>

<body class="min-h-full bg-[#050610] text-white">
    <main
        data-character-manager
        data-manager-shell
        data-api-base="{{ route('characters.index') }}"
        data-event-api-base="{{ url('/api/v1/events') }}"
        data-sidebar-state="collapsed"
        data-mobile-actions="collapsed"
        data-runtime-version="8.1.2-final"
        data-session-state="booting"
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
            class="manager-sidebar"
            dir="rtl"
            aria-label="مدیریت کاراکترها"
        >
            <div class="mobile-sheet-handle" aria-hidden="true"></div>

            <button
                type="button"
                data-sidebar-toggle
                class="sidebar-edge-toggle"
                aria-controls="character-manager-sidebar"
                aria-expanded="false"
                title="جمع‌کردن مدیریت کاراکترها (M)"
            >
                <span data-sidebar-toggle-icon aria-hidden="true">‹</span>
                <span class="sr-only" data-sidebar-toggle-label>جمع‌کردن</span>
            </button>

            <div class="manager-sidebar__scroll">
                <div class="sidebar-compact" aria-hidden="true">
                    <div class="sidebar-compact__logo">D</div>
                    <span class="sidebar-compact__active-dot"></span>
                    <span class="sidebar-compact__name">DEMIAN · V5</span>
                    <span class="sidebar-compact__hint">M</span>
                </div>

                <div class="sidebar-expanded-content">
                    <section class="arcade-panel manager-brand rounded-[28px] p-4">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="arcade-label">Demian mobile arcade engine</p>
                                <h1 class="arcade-title mt-2 text-3xl font-black" data-active-character-name>
                                    TIAM / تیام
                                </h1>
                                <p class="mt-1 text-xs text-zinc-400">
                                    120 Frames · Directional Jump · Adaptive Quality
                                </p>
                            </div>

                            <span class="arcade-badge">V5</span>
                        </div>

                        <div class="mt-4 manager-brand__chip-row">
                            <span class="manager-chip manager-chip--pink">34 Animations</span>
                            <span class="manager-chip manager-chip--cyan">8 Directions</span>
                            <span class="manager-chip manager-chip--yellow">Mobile First</span>
                        </div>
                    </section>

                    <section class="arcade-panel mt-4 rounded-[28px] p-4">
                        <div class="character-selection__header">
                            <div>
                                <p class="arcade-label">Character manager</p>
                                <h2 class="mt-1 text-lg font-black">انتخاب کاراکتر</h2>
                            </div>

                            <div class="scroll-rail-controls" aria-label="پیمایش فهرست کاراکترها">
                                <button type="button" data-character-scroll-previous class="scroll-rail-button" aria-label="کاراکتر قبلی">›</button>
                                <output data-character-scroll-status class="scroll-rail-status" aria-live="polite">0 / 0</output>
                                <button type="button" data-character-scroll-next class="scroll-rail-button" aria-label="کاراکتر بعدی">‹</button>
                            </div>
                        </div>

                        <div
                            data-character-list
                            class="character-selection-rail mt-4"
                            tabindex="0"
                            role="list"
                            aria-label="کاراکترهای قابل انتخاب"
                            aria-live="polite"
                        ></div>
                        <p class="scroll-rail-hint">در گوشی کارت‌ها را به چپ و راست بکش یا از دکمه‌های پیمایش استفاده کن.</p>
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
            class="manager-sidebar-backdrop"
            aria-label="بستن مدیریت کاراکترها"
            aria-hidden="true"
            tabindex="-1"
        ></button>

        <section class="manager-stage" dir="rtl">
            <div class="arcade-screen-bezel" aria-hidden="true"></div>
            <div data-demian-scene class="demian-scene absolute inset-0"></div>


            <div data-game-shell class="game-shell absolute inset-0 z-40" dir="rtl" aria-live="polite">
                <div data-shell-toast-host class="shell-toast-host" aria-live="polite" aria-atomic="false"></div>

                <section
                    data-screen="boot"
                    class="shell-screen shell-screen--boot"
                    aria-label="راه‌اندازی دمیان"
                >
                    <div class="boot-console">
                        <div class="boot-console__mark" aria-hidden="true">D</div>
                        <p class="shell-kicker">DEMIAN GAME PLATFORM</p>
                        <h1>CAFÉ DEMIAN</h1>
                        <p data-boot-message class="boot-console__message">در حال راه‌اندازی هسته‌ی دمیان…</p>
                        <div data-boot-progress-bar class="shell-progress shell-progress--boot">
                            <span></span>
                        </div>
                        <div class="boot-console__meta">
                            <span data-boot-progress-value>0%</span>
                            <span>CORE / RENDERER / INPUT / SHELL</span>
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
                        <div data-menu-reveal class="cafe-menu__eyebrow">
                            <span class="arcade-live-dot"></span>
                            GAME ROOM ONLINE
                        </div>
                        <div data-menu-reveal>
                            <p class="shell-kicker">WELCOME TO</p>
                            <h1 class="cafe-menu__title">CAFÉ<br><b>DEMIAN</b></h1>
                            <p class="cafe-menu__lead">
                                یک هسته، چند جهان؛ کاراکترت را انتخاب کن و وارد بازی بعدی شو.
                            </p>
                        </div>
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
                        </div>
                        <div data-menu-reveal class="cafe-menu__footer">
                            <span>PHASE 3</span>
                            <span>ONE RENDERER · LAZY GAMES · FIXED 60HZ</span>
                        </div>
                    </div>
                    <aside class="cafe-menu__cabinet" aria-hidden="true">
                        <div class="cafe-cabinet__sign">NOW PLAYING</div>
                        <div class="cafe-cabinet__screen">
                            <span>OPEN</span><b>WORLD</b><small>LIVE BACKDROP</small>
                        </div>
                        <div class="cafe-cabinet__controls"><i></i><i></i><i></i></div>
                    </aside>
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
                                <p>هر بازی به‌صورت Lazy بارگذاری می‌شود و از همان هسته‌ی مشترک استفاده می‌کند.</p>
                            </div>
                            <button type="button" data-shell-action="back-cafe" class="shell-icon-button" aria-label="بازگشت به منوی کافه">×</button>
                        </header>
                        <div class="game-library-toolbar">
                            <span class="game-library-toolbar__hint">در موبایل برای دیدن بازی‌های بعدی اسکرول کن</span>
                            <div class="scroll-rail-controls" aria-label="پیمایش کتابخانه بازی">
                                <button type="button" data-game-scroll-previous class="scroll-rail-button" aria-label="بازی قبلی">›</button>
                                <output data-game-scroll-status class="scroll-rail-status" aria-live="polite">0 / 0</output>
                                <button type="button" data-game-scroll-next class="scroll-rail-button" aria-label="بازی بعدی">‹</button>
                            </div>
                        </div>
                        <div data-game-grid class="game-grid" tabindex="0" role="list" aria-label="کتابخانه بازی‌های دمیان"></div>
                        <footer class="shell-page__footer">
                            <span>همه‌ی بازی‌های فازهای ۱ تا ۸ در دسترس‌اند</span>
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
                    <div class="loading-console">
                        <div class="loading-console__orbit" aria-hidden="true"><i></i><i></i><i></i></div>
                        <p class="shell-kicker">LOADING GAME MODULE</p>
                        <h2 data-loading-title>OPEN WORLD</h2>
                        <p data-loading-step>در حال آماده‌سازی بازی…</p>
                        <div data-loading-progress-bar class="shell-progress shell-progress--loading"><span></span></div>
                        <div class="loading-console__meta">
                            <span data-loading-progress-value>0%</span>
                            <span>LAZY IMPORT → PRELOAD → ENTER</span>
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
                                <span><b>کیفیت تصویر</b><small>مستقیماً روی Pixel Ratio بازی اعمال می‌شود.</small></span>
                                <select name="quality">
                                    <option value="auto">خودکار</option>
                                    <option value="performance">Performance</option>
                                    <option value="balanced">Balanced</option>
                                    <option value="high">High</option>
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
                            <div class="settings-toggle-grid">
                                <label><input type="checkbox" name="hudVisible"><span>نمایش HUD</span></label>
                                <label><input type="checkbox" name="hintsVisible"><span>نمایش راهنما</span></label>
                                <label><input type="checkbox" name="soundEnabled"><span>افکت صوتی</span></label>
                                <label><input type="checkbox" name="musicEnabled"><span>موسیقی</span></label>
                            </div>
                            <div class="shell-modal__actions shell-modal__actions--row">
                                <button type="submit" data-screen-autofocus class="shell-button shell-button--primary">ذخیره تنظیمات</button>
                                <button type="button" data-shell-action="reset-settings" class="shell-button shell-button--ghost">پیش‌فرض</button>
                            </div>
                        </form>
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
                        <p class="shell-kicker">SESSION COMPLETE</p>
                        <h2 data-results-title>نتیجه‌ی بازی</h2>
                        <p data-results-subtitle>مرحله به پایان رسید.</p>
                        <div class="results-panel__score"><small>SCORE</small><strong data-results-score>0</strong></div>
                        <div data-results-stats class="results-panel__stats"></div>
                        <div class="shell-modal__actions shell-modal__actions--row">
                            <button type="button" data-shell-action="restart" class="shell-button shell-button--primary">دوباره</button>
                            <button type="button" data-shell-action="replay" data-results-replay class="shell-button" hidden>بازپخش</button>
                            <button type="button" data-shell-action="exit-game" class="shell-button">بازگشت به کافه</button>
                        </div>
                    </div>
                </section>
                <div data-game-hud-host class="game-hud-host"></div>
            </div>

            <header data-gameplay-ui data-world-ui class="stage-toolbar pointer-events-none absolute inset-x-0 top-0 z-20 p-4">
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
                                <span data-focus-character-label>تمرکز تیام</span>
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
                                data-mobile-fullscreen
                                class="arcade-button arcade-button--small mobile-fullscreen-button"
                                aria-pressed="false"
                            >
                                <span aria-hidden="true">⛶</span>
                                <span data-fullscreen-label>افقی تمام‌صفحه</span>
                            </button>
                        </div>
                    </div>

                    <div class="arcade-panel arcade-stage-brand pointer-events-auto rounded-[26px] px-5 py-4">
                        <div class="flex items-center gap-3">
                            <span class="arcade-live-dot" aria-hidden="true"></span>
                            <div>
                                <p class="arcade-label">Player one ready</p>
                                <h2 class="arcade-title mt-1 text-2xl font-black" data-active-character-name>
                                    TIAM / تیام
                                </h2>
                                <p class="mt-1 text-xs text-zinc-400">
                                    120-frame motion · Directional jump · Live NPCs
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div data-gameplay-ui data-world-ui data-hint-ui class="arcade-intro-note pointer-events-none absolute left-1/2 top-28 z-20 -translate-x-1/2">
                جوی‌استیک را تا لبه ببر تا کاراکتر Sprint کند
            </div>

            <section data-gameplay-ui data-world-ui data-hud-ui class="mobile-status-bar arcade-panel pointer-events-none absolute z-20" aria-label="وضعیت بازی">
                <span class="mobile-status-bar__player" data-active-character-name>TIAM / تیام</span>
                <span class="mobile-status-chip"><small>STATE</small><b data-state-label>IDLE</b></span>
                <span class="mobile-status-chip"><small>SPD</small><b data-speed-label>0.00</b></span>
                <span class="mobile-status-chip"><small>NPC</small><b data-npc-label>2</b></span>
            </section>

            <section
                data-gameplay-ui data-world-ui data-hud-ui class="hud-panel arcade-panel pointer-events-none absolute bottom-4 left-4 z-20 rounded-[24px] p-3"
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
                data-gameplay-ui data-world-ui data-hint-ui class="help-panel arcade-panel pointer-events-none absolute bottom-4 right-4 z-20 hidden rounded-[24px] p-3 text-left text-[10px] leading-5 text-zinc-400 lg:block"
                dir="ltr"
            >
                <div class="help-panel__grid">
                    <p><b class="text-white">WASD</b> 8-way move</p>
                    <p><b class="text-white">Shift</b> sprint</p>
                    <p><b class="text-white">Space</b> jump</p>
                    <p><b class="text-white">E / J</b> hit / combo</p>
                    <p><b class="text-white">K / L</b> uppercut / cast</p>
                    <p><b class="text-white">X / U</b> dash / dodge</p>
                    <p><b class="text-white">Q / O</b> win / celebrate</p>
                    <p><b class="text-white">C / V</b> dance / wave</p>
                    <p><b class="text-white">Z / G</b> spin / crouch</p>
                    <p><b class="text-white">B / N</b> laugh / pose</p>
                    <p><b class="text-white">T / Y</b> sleep / taunt</p>
                    <p><b class="text-white">H</b> random speech</p>
                    <p><b class="text-white">Enter</b> interact</p>
                    <p><b class="text-white">F / R</b> camera</p>
                    <p><b class="text-white">M</b> world map</p>
                    <p><b class="text-white">F6</b> quick save</p>
                    <p><b class="text-white">Wheel</b> zoom</p>
                </div>
            </section>

            <section data-gameplay-ui data-control-surface="world" class="touch-controller absolute inset-x-0 bottom-0 z-30" dir="ltr" aria-label="کنترل‌های لمسی بازی">
                <div
                    data-virtual-stick
                    class="virtual-stick"
                    role="application"
                    aria-label="جوی‌استیک حرکت ۸ جهته"
                >
                    <div class="virtual-stick__arrows" aria-hidden="true">
                        <span>▲</span><span>▶</span><span>▼</span><span>◀</span>
                    </div>
                    <div data-virtual-stick-knob class="virtual-stick__knob">
                        <span aria-hidden="true">✦</span>
                    </div>
                    <small class="virtual-stick__label">MOVE / SPRINT</small>
                </div>

                <div class="touch-controller__right">
                    <div
                        id="mobile-action-tray"
                        data-mobile-actions-tray
                        class="mobile-action-tray"
                        aria-hidden="true"
                    >
                        <button type="button" data-input-press="combo" class="touch-action touch-action--mini">COMBO</button>
                        <button type="button" data-input-press="uppercut" class="touch-action touch-action--mini">UPPER</button>
                        <button type="button" data-input-press="cast" class="touch-action touch-action--mini">MAGIC</button>
                        <button type="button" data-input-press="dodge" class="touch-action touch-action--mini">DODGE</button>
                        <button type="button" data-input-press="slide" class="touch-action touch-action--mini">SLIDE</button>
                        <button type="button" data-input-press="win" class="touch-action touch-action--mini">WIN</button>
                        <button type="button" data-input-press="celebrate" class="touch-action touch-action--mini">PARTY</button>
                        <button type="button" data-input-press="dance" class="touch-action touch-action--mini">DANCE</button>
                        <button type="button" data-input-press="wave" class="touch-action touch-action--mini">WAVE</button>
                        <button type="button" data-input-press="spin" class="touch-action touch-action--mini">SPIN</button>
                        <button type="button" data-input-press="speak" class="touch-action touch-action--mini touch-action--speak">SAY</button>
                        <button type="button" data-input-press="taunt" class="touch-action touch-action--mini">TAUNT</button>
                    </div>

                    <div class="touch-controller__actions" aria-label="اکشن‌های اصلی">
                        <button type="button" data-input-press="interact" class="touch-action touch-action--interact touch-action--primary">
                            <span>USE</span><small>◎</small>
                        </button>
                        <button type="button" data-input-hold="run" class="touch-action touch-action--run">
                            <span>RUN</span><small>hold</small>
                        </button>
                        <button type="button" data-input-press="jump" class="touch-action touch-action--jump touch-action--primary">
                            <span>JUMP</span><small>▲</small>
                        </button>
                        <button type="button" data-input-press="attack" class="touch-action touch-action--attack touch-action--primary">
                            <span>HIT</span><small>✦</small>
                        </button>
                        <button type="button" data-input-press="dash" class="touch-action touch-action--dash">
                            <span>DASH</span><small>»</small>
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

            <div data-orientation-hint class="orientation-hint" aria-hidden="true">
                <span aria-hidden="true">↻</span>
                <strong>حالت افقی بازی فعال است</strong>
            </div>
        </section>
    </main>
</body>
</html>
