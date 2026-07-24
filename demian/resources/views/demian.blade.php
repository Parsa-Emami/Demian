<!DOCTYPE html>
<html lang="fa" dir="rtl" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, viewport-fit=cover"
    >
    <meta name="csrf-token" content="{{ csrf_token() }}">

    <title>Demian Arcade Character Manager</title>

    @vite([
        'resources/js/app.js',
    ])
</head>

<body class="min-h-full bg-[#050610] text-white">
    <main
        data-character-manager
        data-api-base="{{ route('characters.index') }}"
        class="manager-shell"
        dir="ltr"
    >
        <aside class="manager-sidebar" dir="rtl">
            <section class="arcade-panel manager-brand rounded-[28px] p-4">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="arcade-label">Demian arcade engine</p>
                        <h1 class="arcade-title mt-2 text-3xl font-black">
                            تیام / TIAM
                        </h1>
                        <p class="mt-1 text-xs text-zinc-400">
                            Cute Sprite Sheet Character System
                        </p>
                    </div>

                    <span class="arcade-badge">V2</span>
                </div>

                <div class="mt-4 manager-brand__chip-row">
                    <span class="manager-chip manager-chip--pink">Cute Motion</span>
                    <span class="manager-chip manager-chip--cyan">Orbit Camera</span>
                    <span class="manager-chip manager-chip--yellow">Sprite Manager</span>
                </div>
            </section>

            <section class="arcade-panel mt-4 rounded-[28px] p-4">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <p class="arcade-label">Character manager</p>
                        <h2 class="mt-1 text-lg font-black">مدیریت کاراکترها</h2>
                    </div>

                    <span class="text-[10px] font-black text-cyan-300">LEFT SIDEBAR</span>
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
                        فایل Sprite Sheet و Atlas JSON را وارد کن تا کاراکتر جدید
                        داخل سیستم ثبت شود.
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
                <p class="arcade-label">Tips</p>

                <ul class="mt-3 space-y-2 text-[11px] leading-6 text-zinc-400">
                    <li>• تیام به‌صورت Built-in داخل پروژه وجود دارد.</li>
                    <li>• با Space پرش، با E حمله و با Q حالت برد اجرا می‌شود.</li>
                    <li>• Orbit دوربین با F جابه‌جا می‌شود و با R ریست می‌شود.</li>
                </ul>
            </section>
        </aside>

        <section class="manager-stage" dir="rtl">
            <div data-demian-scene class="absolute inset-0"></div>

            <header class="pointer-events-none absolute inset-x-0 top-0 z-20 p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="arcade-panel pointer-events-auto rounded-2xl p-2">
                        <div class="flex flex-wrap gap-2">
                            <button
                                type="button"
                                data-camera-reset
                                class="arcade-button arcade-button--small"
                            >
                                Reset R
                            </button>

                            <button
                                type="button"
                                data-camera-toggle
                                class="arcade-button arcade-button--small arcade-button--cyan"
                            >
                                Camera F
                            </button>
                        </div>
                    </div>

                    <div class="arcade-panel pointer-events-auto rounded-[26px] px-5 py-4">
                        <p class="arcade-label">Demian arcade engine</p>
                        <h2 class="arcade-title mt-2 text-2xl font-black">
                            تیام / TIAM
                        </h2>
                        <p class="mt-1 text-xs text-zinc-400">
                            Sprite Sheet Character System
                        </p>
                    </div>
                </div>
            </header>

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

                    <span class="text-zinc-500">CAMERA</span>
                    <strong data-camera-label class="text-cyan-300">FOLLOW</strong>
                </div>
            </section>

            <section
                class="help-panel arcade-panel pointer-events-none absolute bottom-4 right-4 z-20 hidden rounded-[24px] p-3 text-left text-[10px] leading-5 text-zinc-400 sm:block"
                dir="ltr"
            >
                <p><b class="text-white">WASD</b> move</p>
                <p><b class="text-white">Shift</b> run</p>
                <p><b class="text-white">Space</b> jump</p>
                <p><b class="text-white">E</b> attack</p>
                <p><b class="text-white">Q</b> win</p>
                <p><b class="text-white">Mouse</b> orbit / zoom</p>
            </section>
        </section>
    </main>
</body>
</html>