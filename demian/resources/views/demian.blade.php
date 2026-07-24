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
        class="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_390px]"
    >
        <section class="relative min-h-[68vh] overflow-hidden lg:min-h-screen">
            <div data-demian-scene class="absolute inset-0"></div>

            <header class="pointer-events-none absolute inset-x-0 top-0 z-20 p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="arcade-panel pointer-events-auto rounded-2xl px-4 py-3">
                        <p class="arcade-label">Demian arcade engine</p>
                        <h1 class="arcade-title mt-1 text-2xl font-black">
                            TIAM / تیام
                        </h1>
                        <p class="mt-1 text-xs text-zinc-400">
                            Sprite Sheet Character System
                        </p>
                    </div>

                    <div class="arcade-panel pointer-events-auto rounded-2xl p-2">
                        <div class="flex flex-wrap gap-2">
                            <button
                                type="button"
                                data-camera-toggle
                                class="arcade-button arcade-button--small arcade-button--cyan"
                            >
                                Camera F
                            </button>

                            <button
                                type="button"
                                data-camera-reset
                                class="arcade-button arcade-button--small"
                            >
                                Reset R
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <section
                class="arcade-panel pointer-events-none absolute bottom-4 left-4 z-20 rounded-2xl p-3"
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
                class="arcade-panel pointer-events-none absolute bottom-4 right-4 z-20 hidden rounded-2xl p-3 text-left text-[10px] leading-5 text-zinc-400 sm:block"
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

        <aside
            class="relative z-30 max-h-screen overflow-y-auto border-r border-fuchsia-400/15 bg-[#070815]/95 p-4 lg:min-h-screen"
        >
            <section class="arcade-panel rounded-2xl p-4">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <p class="arcade-label">Character manager</p>
                        <h2 class="mt-1 text-lg font-black">مدیریت کاراکترها</h2>
                    </div>

                    <span class="arcade-badge">V1</span>
                </div>

                <div
                    data-character-list
                    class="mt-4 grid gap-3"
                    aria-live="polite"
                ></div>
            </section>

            <section class="arcade-panel mt-4 rounded-2xl p-4">
                <div>
                    <p class="arcade-label">Import character</p>
                    <h2 class="mt-1 text-base font-black">افزودن Sprite Sheet</h2>
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

            <section class="mt-4 rounded-2xl border border-white/5 p-4">
                <p class="text-[11px] leading-6 text-zinc-500">
                    تیام به‌صورت Built-in داخل پروژه قرار گرفته و قابل حذف نیست.
                    کاراکترهای جدید از طریق Laravel Storage ذخیره می‌شوند.
                </p>
            </section>
        </aside>
    </main>
</body>
</html>
