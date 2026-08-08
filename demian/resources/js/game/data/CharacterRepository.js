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
