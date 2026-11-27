export function sendPwaMessage(worker, data, { onProgress = () => {}, timeoutMs = 30000 } = {}) {
    if (!worker || typeof MessageChannel !== 'function') {
        return Promise.reject(new Error('Service Worker در دسترس نیست.'));
    }
    return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        let timer;
        const cleanup = () => {
            clearTimeout(timer);
            channel.port1.close();
            channel.port2.close();
        };
        const arm = () => {
            clearTimeout(timer);
            timer = setTimeout(() => { cleanup(); reject(new Error('پاسخ مدیریت آفلاین به‌موقع نرسید.')); }, timeoutMs);
        };
        channel.port1.onmessage = event => {
            const row = event.data ?? {};
            if (row.type === 'PROGRESS') {
                arm();
                try { onProgress(row); } catch (error) { cleanup(); reject(error); }
            } else if (row.type === 'DONE') {
                cleanup(); resolve(row);
            } else if (row.type === 'ERROR') {
                cleanup(); reject(new Error(String(row.message ?? 'خطای دانلود آفلاین')));
            }
        };
        arm();
        try { worker.postMessage(data, [channel.port2]); }
        catch (error) { cleanup(); reject(error); }
    });
}

export function requestWorkerFromPage(page, type, id) {
    return page.evaluate(`(${sendPwaMessage})(navigator.serviceWorker.controller, ${JSON.stringify({ type, id })}, { timeoutMs: 120000 })`);
}
