<!DOCTYPE html>
<html lang="fa" dir="rtl" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    >
    <meta name="csrf-token" content="{{ csrf_token() }}">

    <title>Demian 2D Arcade · Characters</title>

    @vite([
        'resources/js/app.js',
    ])
</head>

<body class="min-h-full bg-[#050610] text-white">
    <main
        data-character-manager
        data-manager-shell
        data-api-base="{{ route('characters.index') }}"
        data-sidebar-state="expanded"
        class="manager-shell"
        dir="ltr"
    >
        <aside
            id="character-manager-sidebar"
            data-manager-sidebar
            class="manager-sidebar"
            dir="rtl"
        >
            <button
                type="button"
                data-sidebar-toggle
                class="sidebar-edge-toggle"
                aria-controls="character-manager-sidebar"
                aria-expanded="true"
                title="جمع‌کردن مدیریت کاراکترها (M)"
            >
                <span data-sidebar-toggle-icon aria-hidden="true">‹</span>
                <span class="sr-only" data-sidebar-toggle-label>جمع‌کردن</span>
            </button>

            <div class="manager-sidebar__scroll">
                <div class="sidebar-compact" aria-hidden="true">
                    <div class="sidebar-compact__logo">D</div>
                    <span class="sidebar-compact__active-dot"></span>
                    <span class="sidebar-compact__name">DEMIAN · 2D</span>
                    <span class="sidebar-compact__hint">M</span>
                </div>

                <div class="sidebar-expanded-content">
                    <section class="arcade-panel manager-brand rounded-[28px] p-4">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="arcade-label">Demian 2D arcade engine</p>
                                <h1 class="arcade-title mt-2 text-3xl font-black" data-active-character-name>
                                    TIAM / تیام
                                </h1>
                                <p class="mt-1 text-xs text-zinc-400">
                                    Stable Sprite · Cute Procedural Motion
                                </p>
                            </div>

                            <span class="arcade-badge">V3</span>
                        </div>

                        <div class="mt-4 manager-brand__chip-row">
                            <span class="manager-chip manager-chip--pink">Stable Facing</span>
                            <span class="manager-chip manager-chip--cyan">2D Arcade</span>
                            <span class="manager-chip manager-chip--yellow">Cute FX</span>
                        </div>
                    </section>

                    <section class="arcade-panel mt-4 rounded-[28px] p-4">
                        <div class="flex items-center justify-between gap-3">
                            <div>
                                <p class="arcade-label">Character manager</p>
                                <h2 class="mt-1 text-lg font-black">مدیریت کاراکترها</h2>
                            </div>

                            <span class="text-[10px] font-black text-cyan-300">PLAYER SELECT</span>
                        </div>

                        <div
                            data-character-list
                            class="mt-4 grid gap-3"
                            aria-live="polite"
                        ></div>
                    </section>

                    <section class="arcade-panel mt-4 rounded-[28px] p-4">
                        <div>
                            <p class="arcade-label">Import character</p>
                            <h2 class="mt-1 text-base font-black">افزودن Sprite Sheet</h2>
                            <p class="mt-1 text-[11px] leading-5 text-zinc-500">
                                Sprite Sheet و Atlas JSON را وارد کن تا کاراکتر جدید
                                داخل موتور آرکیدی ثبت شود.
                            </p>
                        </div>

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
                                            فایل را بکش و اینجا رها کن یا انتخابش کن
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
                    </section>

                    <section class="arcade-panel mt-4 rounded-[28px] p-4">
                        <p class="arcade-label">کنترل‌ها</p>

                        <ul class="mt-3 space-y-2 text-[11px] leading-6 text-zinc-400">
                            <li>• حرکت با WASD یا جهت‌ها؛ Shift برای دویدن.</li>
                            <li>• Space پرش، E ضربه، Q برد، X دش و U جاخالی.</li>
                            <li>• C رقص، V دست‌تکان‌دادن، Z چرخش، G نشستن.</li>
                            <li>• B خنده، N ژست، T خواب و Y کری‌خوانی.</li>
                            <li>• با هر بار فشردن H یک جمله تصادفی مخصوص کاراکتر انتخاب‌شده نمایش داده می‌شود.</li>
                            <li>• F تغییر نما، R تمرکز روی کاراکتر و M جمع‌کردن سایدبار.</li>
                        </ul>
                    </section>
                </div>
            </div>
        </aside>

        <section class="manager-stage" dir="rtl">
            <div class="arcade-screen-bezel" aria-hidden="true"></div>
            <div data-demian-scene class="demian-scene absolute inset-0"></div>

            <header class="pointer-events-none absolute inset-x-0 top-0 z-20 p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="arcade-panel pointer-events-auto rounded-2xl p-2">
                        <div class="flex flex-wrap gap-2">
                            <button
                                type="button"
                                data-camera-reset
                                class="arcade-button arcade-button--small arcade-button--focus"
                                title="کاراکتر انتخاب‌شده را وسط تصویر قرار بده"
                            >
                                <span data-focus-character-label>تمرکز تیام</span> · R
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
                                data-sidebar-toggle
                                class="arcade-button arcade-button--small sidebar-stage-toggle"
                                aria-controls="character-manager-sidebar"
                                aria-expanded="true"
                                title="جمع‌کردن مدیریت کاراکترها (M)"
                            >
                                <span data-sidebar-toggle-icon aria-hidden="true">‹</span>
                                <span data-sidebar-toggle-label>جمع‌کردن</span>
                                <kbd>M</kbd>
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
                                    No frame flicker · Pixel-perfect character
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div class="arcade-intro-note pointer-events-none absolute left-1/2 top-28 z-20 -translate-x-1/2">
                کاراکتر انتخاب‌شده آماده بازی است؛ برای جمله تصادفی کلید H را بزن
            </div>

            <section
                class="hud-panel arcade-panel pointer-events-none absolute bottom-4 left-4 z-20 rounded-[24px] p-3"
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
                </div>
            </section>

            <section
                class="help-panel arcade-panel pointer-events-none absolute bottom-4 right-4 z-20 hidden rounded-[24px] p-3 text-left text-[10px] leading-5 text-zinc-400 lg:block"
                dir="ltr"
            >
                <div class="help-panel__grid">
                    <p><b class="text-white">WASD</b> move</p>
                    <p><b class="text-white">Shift</b> run</p>
                    <p><b class="text-white">Space</b> jump</p>
                    <p><b class="text-white">E</b> attack</p>
                    <p><b class="text-white">Q</b> victory</p>
                    <p><b class="text-white">X</b> dash</p>
                    <p><b class="text-white">U</b> dodge</p>
                    <p><b class="text-white">C</b> dance</p>
                    <p><b class="text-white">V</b> wave</p>
                    <p><b class="text-white">Z</b> spin</p>
                    <p><b class="text-white">G</b> crouch</p>
                    <p><b class="text-white">B</b> laugh</p>
                    <p><b class="text-white">N</b> pose</p>
                    <p><b class="text-white">T</b> sleep</p>
                    <p><b class="text-white">Y</b> taunt</p>
                    <p><b class="text-white">H</b> random speech</p>
                    <p><b class="text-white">F / R</b> camera</p>
                    <p><b class="text-white">Wheel</b> zoom</p>
                </div>
            </section>

            <section class="touch-controller absolute inset-x-0 bottom-3 z-30" dir="ltr">
                <div class="touch-controller__movement" aria-label="کنترل حرکت">
                    <button type="button" data-input-hold="up" class="touch-key touch-key--up" aria-label="بالا">▲</button>
                    <button type="button" data-input-hold="left" class="touch-key touch-key--left" aria-label="چپ">◀</button>
                    <button type="button" data-input-hold="down" class="touch-key touch-key--down" aria-label="پایین">▼</button>
                    <button type="button" data-input-hold="right" class="touch-key touch-key--right" aria-label="راست">▶</button>
                </div>

                <div class="touch-controller__actions" aria-label="اکشن‌های کاراکتر">
                    <button type="button" data-input-hold="run" class="touch-action touch-action--run">RUN</button>
                    <button type="button" data-input-press="jump" class="touch-action touch-action--jump">JUMP</button>
                    <button type="button" data-input-press="attack" class="touch-action touch-action--attack">HIT</button>
                    <button type="button" data-input-press="dash" class="touch-action touch-action--dash">DASH</button>
                    <button type="button" data-input-press="dance" class="touch-action touch-action--dance">DANCE</button>
                    <button type="button" data-input-press="speak" class="touch-action touch-action--speak">SAY</button>
                </div>
            </section>
        </section>
    </main>
</body>
</html>
