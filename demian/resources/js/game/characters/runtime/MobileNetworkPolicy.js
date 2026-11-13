/** Mobile-04: progressive, data-aware optional asset loading.
 *  Network Information API is an optional hint; iOS Safari may not expose it.
 *  Never block a player-requested pack merely because navigator.onLine is false:
 *  offline resources can still be served by the browser cache.
 */
export function optionalAssetPolicy({
    connection = globalThis.navigator?.connection,
    online = globalThis.navigator?.onLine,
    hidden = globalThis.document?.hidden,
} = {}) {
    const type = connection?.effectiveType ?? null;
    const saveData = connection?.saveData === true;
    const blocked = hidden === true || online === false;
    const maxBackgroundNpcs = blocked || saveData || type === 'slow-2g' || type === '2g'
        ? 0 : type === '3g' ? 1 : Infinity;
    return Object.freeze({
        maxBackgroundNpcs,
        deferBackground: maxBackgroundNpcs === 0,
        reason: hidden ? 'hidden' : online === false ? 'offline' : saveData ? 'save-data'
            : type === '2g' || type === 'slow-2g' ? 'slow-network' : type === '3g' ? 'limited-3g' : 'normal',
    });
}

export function abortedError() {
    const error = new Error('Optional sprite request cancelled.');
    error.name = 'AbortError';
    return error;
}

export function isAborted(error, signal) {
    return signal?.aborted || error?.name === 'AbortError';
}

/** Retry only transient errors: 408, 429, 5xx, interrupted fetch/image and timeouts.
 *  404, malformed JSON, invalid integrity and explicitly aborted requests do not retry.
 */
export function isTransientAssetError(error) {
    const status = Number(error?.status);
    if (status > 0) return status === 408 || status === 429 || status >= 500;
    return error?.name === 'TypeError' || error?.code === 'NETWORK_ERROR' || error?.code === 'TIMEOUT';
}

export function cancellableDelay(ms, signal, schedule = setTimeout, cancel = clearTimeout) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(abortedError()); return; }
        const finish = () => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        };
        const onAbort = () => {
            cancel(timer);
            signal?.removeEventListener('abort', onAbort);
            reject(abortedError());
        };
        const timer = schedule(finish, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

export async function withTransientRetry(operation, {
    signal = null, attempts = 2, baseDelayMs = 250, onRetry = () => {},
    delay = cancellableDelay,
} = {}) {
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 4) throw new RangeError('Invalid retry attempts');
    for (let attempt = 1; attempt <= attempts; attempt++) {
        if (signal?.aborted) throw abortedError();
        try {
            return await operation(attempt);
        } catch (error) {
            if (isAborted(error, signal)) throw abortedError();
            if (!isTransientAssetError(error) || attempt === attempts) throw error;
            onRetry(error, attempt);
            await delay(Math.min(1500, baseDelayMs * 2 ** (attempt - 1)), signal);
        }
    }
}
