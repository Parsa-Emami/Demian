import ScrollSnapRail from './ScrollSnapRail.js';

export default class CharacterManagerUI {
    constructor({ root, manager = null, managerProvider = null, eventBus }) {
        this.root = root;
        this.managerRef = manager;
        this.managerProvider = managerProvider;
        this.eventBus = eventBus;

        this.listElement = root.querySelector('[data-character-list]');
        this.characterRail = null;
        this.characterRailPrevious = root.querySelector('[data-character-scroll-previous]');
        this.characterRailNext = root.querySelector('[data-character-scroll-next]');
        this.characterRailStatus = root.querySelector('[data-character-scroll-status]');
        this.form = root.querySelector('[data-character-form]');
        this.dropZone = root.querySelector('[data-drop-zone]');
        this.preview = root.querySelector('[data-sheet-preview]');
        this.submitButton = root.querySelector('[data-character-submit]');
        this.formError = root.querySelector('[data-form-error]');

        this.stateLabels = [...document.querySelectorAll('[data-state-label]')];
        this.speedLabels = [...document.querySelectorAll('[data-speed-label]')];
        this.positionLabels = [...document.querySelectorAll('[data-position-label]')];
        this.cameraLabels = [...document.querySelectorAll('[data-camera-label]')];
        this.qualityLabels = [...document.querySelectorAll('[data-quality-label]')];
        this.npcLabels = [...document.querySelectorAll('[data-npc-label]')];
        this.activeNameElements = [
            ...document.querySelectorAll('[data-active-character-name]'),
        ];
        this.focusLabelElements = [
            ...document.querySelectorAll('[data-focus-character-label]'),
        ];
    }

    getManager() {
        return this.managerProvider?.() ?? this.managerRef;
    }

    boot() {
        this.bindForm();
        this.bindCharacterRail();
        this.bindDropZone();

        this.eventBus.on('characters:changed', (characters) => {
            this.renderList(characters);
        });

        this.eventBus.on('studio:frame', (frame) => {
            this.renderHud(frame);
        });

        this.eventBus.on('camera:mode', (mode) => {
            this.cameraLabels.forEach((label) => {
                label.textContent = mode;
            });
        });

        this.eventBus.on('studio:quality', ({ label }) => {
            this.qualityLabels.forEach((element) => {
                element.textContent = label;
            });
        });

        this.eventBus.on('world:roster', ({ npcCount }) => {
            this.npcLabels.forEach((element) => {
                element.textContent = String(npcCount);
            });
        });

        this.eventBus.on('character:warning', ({ message }) => {
            this.showToast(message, false);
        });

        this.eventBus.on('character:selected', ({ record }) => {
            this.renderActiveCharacter(record);
        });

        this.eventBus.on('game:launched', () => {
            const manager = this.getManager();
            if (manager) {
                this.renderList(manager.characters);
                this.renderActiveCharacter(manager.activeRecord);
            }
        });

        const manager = this.getManager();
        if (manager) {
            this.renderList(manager.characters);
            this.renderActiveCharacter(manager.activeRecord);
        }
    }


    bindCharacterRail() {
        if (!this.listElement || this.characterRail) return;

        this.characterRail = new ScrollSnapRail({
            viewport: this.listElement,
            itemSelector: '[data-character-card]',
            previousButton: this.characterRailPrevious,
            nextButton: this.characterRailNext,
            statusElement: this.characterRailStatus,
            focusSelector: '[data-select-character], [data-activate-character]',
        }).boot();
    }

    renderList(characters) {
        if (!this.listElement) {
            return;
        }

        this.listElement.innerHTML = '';

        characters.forEach((character) => {
            const metaLine = this.renderCharacterMetaLine(character);
            const badgeLine = this.renderCharacterStatBadges(character);
            const card = document.createElement('article');
            card.className = [
                'character-card',
                character.is_active ? 'is-active' : '',
            ].join(' ');
            card.dataset.characterCard = String(character.id);
            card.dataset.scrollRailItem = String(character.id);
            card.setAttribute('role', 'group');
            card.setAttribute('aria-label', `${character.name}${character.is_active ? '، کاراکتر فعال' : ''}`);
            card.dir = 'rtl';

            card.innerHTML = `
                <div class="character-card__preview">
                    <img
                        src="${this.escape(character.sprite_url)}"
                        alt="${this.escape(character.name)}"
                        loading="lazy"
                        style="width: ${character.sprite_url.includes('-v6-') ? '2100%' : character.sprite_url.includes('-v5-') ? '1500%' : character.sprite_url.includes('-v4') ? '1200%' : '400%'}"
                    >
                </div>

                <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <h3 class="truncate text-sm font-black text-white">
                                ${this.escape(character.name)}
                            </h3>
                            <p class="mt-1 truncate font-mono text-[11px] text-zinc-500">
                                ${this.escape(character.slug)}
                            </p>
                            ${metaLine}
                        </div>

                        ${
                            character.is_active
                                ? '<span class="arcade-badge">ACTIVE</span>'
                                : ''
                        }
                    </div>

                    ${badgeLine}

                    <div class="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            class="arcade-button arcade-button--small"
                            data-select-character="${character.id}"
                        >
                            نمایش
                        </button>

                        ${
                            character.is_active
                                ? ''
                                : `
                                    <button
                                        type="button"
                                        class="arcade-button arcade-button--small arcade-button--cyan"
                                        data-activate-character="${character.id}"
                                    >
                                        فعال‌سازی
                                    </button>
                                `
                        }

                        ${
                            character.is_builtin
                                ? '<span class="self-center text-[10px] text-fuchsia-300">BUILT-IN</span>'
                                : `
                                    <button
                                        type="button"
                                        class="arcade-button arcade-button--small arcade-button--danger"
                                        data-delete-character="${character.id}"
                                    >
                                        حذف
                                    </button>
                                `
                        }
                    </div>
                </div>
            `;

            this.listElement.appendChild(card);
        });

        const activeCard = this.listElement.querySelector('.character-card.is-active');
        this.characterRail?.refresh({ preserveIndex: true, preferredItem: activeCard });

        this.listElement
            .querySelectorAll('[data-select-character]')
            .forEach((button) => {
                button.addEventListener('click', async () => {
                    await this.guard(() =>
                        this.getManager()?.select(button.dataset.selectCharacter)
                    );
                    const card = button.closest('[data-character-card]');
                    const index = this.characterRail?.items.indexOf(card) ?? -1;
                    if (index >= 0) this.characterRail?.scrollTo(index, { behavior: 'smooth' });
                });
            });

        this.listElement
            .querySelectorAll('[data-activate-character]')
            .forEach((button) => {
                button.addEventListener('click', async () => {
                    await this.guard(() =>
                        this.getManager()?.activate(button.dataset.activateCharacter)
                    );
                    this.root.dispatchEvent(new CustomEvent('character-ui:activated', {
                        bubbles: true,
                        detail: { characterId: button.dataset.activateCharacter },
                    }));
                });
            });

        this.listElement
            .querySelectorAll('[data-delete-character]')
            .forEach((button) => {
                button.addEventListener('click', async () => {
                    const accepted = window.confirm(
                        'این کاراکتر و فایل‌هایش حذف شوند؟'
                    );

                    if (!accepted) {
                        return;
                    }

                    await this.guard(() =>
                        this.getManager()?.remove(button.dataset.deleteCharacter)
                    );
                });
            });
    }

    renderCharacterMetaLine(character) {
        const roleTitle = character?.settings?.role_title;
        const tagline = character?.settings?.tagline;
        const chunks = [roleTitle, tagline]
            .filter(Boolean)
            .map((value) => this.escape(String(value)));

        if (!chunks.length) {
            return '';
        }

        return `
            <p class="mt-1 leading-4 text-[11px] text-amber-300/90">
                ${chunks.join(' · ')}
            </p>
        `;
    }

    renderCharacterStatBadges(character) {
        const badges = [];
        const speed = character?.settings?.speed_rating;
        const power = character?.settings?.power_rating;

        if (speed) {
            badges.push(`<span class="arcade-badge arcade-badge--subtle">SPD ${this.escape(String(speed))}</span>`);
        }

        if (power) {
            badges.push(`<span class="arcade-badge arcade-badge--subtle arcade-badge--gold">PWR ${this.escape(String(power))}</span>`);
        }

        if (!badges.length) {
            return '';
        }

        return `
            <div class="mt-3 flex flex-wrap gap-2">
                ${badges.join('')}
            </div>
        `;
    }


    bindForm() {
        this.form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            this.clearFormError();

            const formData = new FormData(this.form);
            const name = String(formData.get('name') ?? '').trim();
            const slugField = this.form.querySelector('[name="slug"]');

            if (slugField && !String(slugField.value).trim()) {
                slugField.value = this.slugify(name);
                formData.set('slug', slugField.value);
            }

            this.setSubmitting(true);

            try {
                const manager = this.getManager();
                if (!manager) {
                    throw new Error('مدیریت کاراکتر در این بازی در دسترس نیست.');
                }
                const character = await manager.create(formData);
                this.form.reset();
                this.preview?.removeAttribute('src');
                this.showToast(`${character.name} ساخته شد.`);
            } catch (error) {
                this.showFormError(error);
            } finally {
                this.setSubmitting(false);
            }
        });
    }

    bindDropZone() {
        const input = this.form?.querySelector('[name="sprite_sheet"]');

        if (!this.dropZone || !input) {
            return;
        }

        ['dragenter', 'dragover'].forEach((eventName) => {
            this.dropZone.addEventListener(eventName, (event) => {
                event.preventDefault();
                this.dropZone.classList.add('is-dragging');
            });
        });

        ['dragleave', 'drop'].forEach((eventName) => {
            this.dropZone.addEventListener(eventName, (event) => {
                event.preventDefault();
                this.dropZone.classList.remove('is-dragging');
            });
        });

        this.dropZone.addEventListener('drop', (event) => {
            const file = event.dataTransfer?.files?.[0];

            if (!file) {
                return;
            }

            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            this.previewFile(file);
        });

        input.addEventListener('change', () => {
            const file = input.files?.[0];

            if (file) {
                this.previewFile(file);
            }
        });
    }

    previewFile(file) {
        if (!this.preview) {
            return;
        }

        const url = URL.createObjectURL(file);
        this.preview.src = url;
        this.preview.onload = () => URL.revokeObjectURL(url);
    }

    renderHud({ state, speed, position, cameraMode }) {
        this.stateLabels.forEach((label) => {
            label.textContent = state.toUpperCase();
        });

        this.speedLabels.forEach((label) => {
            label.textContent = speed.toFixed(2);
        });

        this.positionLabels.forEach((label) => {
            label.textContent = `${position.x.toFixed(1)} / ${position.z.toFixed(1)}`;
        });

        this.cameraLabels.forEach((label) => {
            label.textContent = cameraMode;
        });
    }

    renderActiveCharacter(record) {
        if (!record) {
            return;
        }

        const fullName = String(record.name ?? record.slug ?? 'Character');
        const parts = fullName
            .split('/')
            .map((part) => part.trim())
            .filter(Boolean);
        const latinName = parts[0] ?? fullName;
        const localizedName = parts[1] ?? latinName;

        this.activeNameElements.forEach((element) => {
            element.textContent = fullName;
        });

        this.focusLabelElements.forEach((element) => {
            element.textContent = `تمرکز ${localizedName}`;
        });

        document.title = `Demian V5 Open Arcade · ${latinName}`;
    }

    async guard(callback) {
        try {
            await callback();
        } catch (error) {
            this.showToast(error.message ?? 'عملیات ناموفق بود.', true);
            console.error(error);
        }
    }

    setSubmitting(submitting) {
        if (!this.submitButton) {
            return;
        }

        this.submitButton.disabled = submitting;
        this.submitButton.textContent = submitting
            ? 'در حال ساخت...'
            : 'افزودن کاراکتر';
    }

    showFormError(error) {
        if (!this.formError) {
            return;
        }

        const messages = Object.values(error.errors ?? {})
            .flat()
            .filter(Boolean);

        this.formError.textContent =
            messages[0] ?? error.message ?? 'فرم معتبر نیست.';
        this.formError.hidden = false;
    }

    clearFormError() {
        if (this.formError) {
            this.formError.hidden = true;
            this.formError.textContent = '';
        }
    }

    showToast(message, danger = false) {
        const toast = document.createElement('div');
        toast.className = danger ? 'arcade-toast is-danger' : 'arcade-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('is-visible'));

        window.setTimeout(() => {
            toast.classList.remove('is-visible');
            window.setTimeout(() => toast.remove(), 250);
        }, 2500);
    }

    slugify(value) {
        return value
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || `character-${Date.now()}`;
    }

    dispose() {
        this.characterRail?.dispose();
        this.characterRail = null;
    }

    escape(value) {
        const element = document.createElement('div');
        element.textContent = String(value ?? '');
        return element.innerHTML;
    }
}
