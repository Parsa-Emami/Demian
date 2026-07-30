function normalizeBaseUrl(value) {
    return String(value ?? '').trim().replace(/\/+$/, '');
}

function createTimeoutError() {
    if (typeof DOMException === 'function') {
        return new DOMException('Event API request timed out.', 'TimeoutError');
    }
    const error = new Error('Event API request timed out.');
    error.name = 'TimeoutError';
    return error;
}

function createAbortScope(externalSignal, timeoutMs) {
    const controller = new AbortController();
    const abort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abort();
    else externalSignal?.addEventListener?.('abort', abort, { once: true });

    const timeout = globalThis.setTimeout(
        () => controller.abort(createTimeoutError()),
        Math.max(1, Number(timeoutMs) || 5000)
    );

    return {
        signal: controller.signal,
        dispose() {
            globalThis.clearTimeout(timeout);
            externalSignal?.removeEventListener?.('abort', abort);
        },
    };
}

async function parseJson(response) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const firstValidationError = Object.values(payload?.errors ?? {})
            .flat()
            .find((value) => typeof value === 'string');
        const message = payload?.message
            ?? firstValidationError
            ?? `Event API request failed (${response.status}).`;
        throw new Error(message);
    }
    return payload;
}

/** Network adapter for authoritative event sessions and idempotent reward claims. */
export default class EventApiClient {
    constructor({
        baseUrl,
        fetcher = globalThis.fetch?.bind(globalThis),
        timeoutMs = 5000,
    } = {}) {
        this.eventsBaseUrl = normalizeBaseUrl(baseUrl);
        this.apiVersionBaseUrl = this.eventsBaseUrl.endsWith('/events')
            ? this.eventsBaseUrl.slice(0, -'/events'.length)
            : this.eventsBaseUrl;
        this.fetcher = fetcher;
        this.timeoutMs = Math.max(250, Number(timeoutMs) || 5000);
    }

    get enabled() {
        return Boolean(this.eventsBaseUrl && this.fetcher);
    }

    async request(url, { method = 'GET', body, signal, headers = {} } = {}) {
        if (!this.enabled) throw new Error('Event API is not configured.');
        const abortScope = createAbortScope(signal, this.timeoutMs);
        try {
            const response = await this.fetcher(url, {
                method,
                signal: abortScope.signal,
                headers: {
                    Accept: 'application/json',
                    ...(body ? { 'Content-Type': 'application/json' } : {}),
                    ...headers,
                },
                body: body ? JSON.stringify(body) : undefined,
            });
            return await parseJson(response);
        } finally {
            abortScope.dispose();
        }
    }

    async startSession(eventId, metadata = {}, { signal } = {}) {
        const payload = await this.request(`${this.eventsBaseUrl}/${encodeURIComponent(eventId)}/sessions`, {
            method: 'POST',
            signal,
            body: metadata,
        });
        if (!payload?.data?.id || !payload?.data?.token || !payload?.definition?.id) {
            throw new Error('Event API returned an invalid session payload.');
        }
        return Object.freeze({
            session: Object.freeze({ ...payload.data }),
            definition: payload.definition,
        });
    }

    async completeSession(session, result, { signal } = {}) {
        if (!session?.id || !session?.token) throw new Error('Event session credentials are missing.');
        const payload = await this.request(`${this.apiVersionBaseUrl}/event-sessions/${encodeURIComponent(session.id)}/complete`, {
            method: 'POST',
            signal,
            headers: { 'X-Event-Token': session.token },
            body: result,
        });
        if (!payload?.data?.id) throw new Error('Event API returned an invalid reward claim.');
        return Object.freeze({ ...payload.data });
    }
}
