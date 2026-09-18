import {
    PRODUCTION_CHARACTER_SLUGS,
    LEGACY_CHARACTER_SLUGS,
    characterProductionStatus,
    isProductionReady,
} from '../characters/manifests/CharacterManifestRegistry.js';

const REQUEST_TIMEOUT_MS = 4500;

export default class CharacterRepository {
    constructor({ baseUrl, csrfToken }) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.csrfToken = csrfToken;
    }

    async list() {
        const response = await this.request(this.baseUrl);
        return response.data;
    }

    /**
     * Character Core V4 convenience wrapper around list(): returns the same
     * records, annotated with `production_status`/`is_production_ready` from
     * the manifest registry and sorted production-ready characters first.
     * Does not change what list() itself returns.
     */
    async listRankedByProductionStatus() {
        const characters = await this.list();
        return [...characters]
            .map((character) => ({
                ...character,
                production_status: characterProductionStatus(character.slug),
                is_production_ready: isProductionReady(character.slug),
            }))
            .sort((a, b) => Number(b.is_production_ready) - Number(a.is_production_ready));
    }

    /** Slugs the manifest registry considers gold-standard production characters (see CharacterManifestRegistry.js). */
    static productionSlugs() {
        return PRODUCTION_CHARACTER_SLUGS;
    }

    /** Slugs the manifest registry considers legacy / pending_reference_rebuild. */
    static legacySlugs() {
        return LEGACY_CHARACTER_SLUGS;
    }

    async create(formData) {
        const response = await this.request(this.baseUrl, {
            method: 'POST',
            body: formData,
        });

        return response.data;
    }

    async activate(id) {
        const response = await this.request(`${this.baseUrl}/${id}/activate`, {
            method: 'POST',
        });

        return response.data;
    }

    async remove(id) {
        return this.request(`${this.baseUrl}/${id}`, {
            method: 'DELETE',
        });
    }

    async request(url, options = {}) {
        const headers = new Headers(options.headers ?? {});
        headers.set('Accept', 'application/json');
        headers.set('X-Requested-With', 'XMLHttpRequest');

        if (this.csrfToken) {
            headers.set('X-CSRF-TOKEN', this.csrfToken);
        }

        const controller = new AbortController();
        const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(url, {
                credentials: 'same-origin',
                ...options,
                headers,
                signal: options.signal ?? controller.signal,
            });
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error('زمان پاسخ‌گویی سرویس کاراکترها بیش از حد مجاز شد.');
            }
            throw error;
        } finally {
            globalThis.clearTimeout(timeout);
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(data.message || 'خطا در ارتباط با سرور');
            error.status = response.status;
            error.errors = data.errors ?? {};
            throw error;
        }

        return data;
    }
}
