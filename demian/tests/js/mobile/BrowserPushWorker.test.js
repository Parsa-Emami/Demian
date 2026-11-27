import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../../../tools/templates/service-worker.js', import.meta.url), 'utf8');
const scope = 'https://example.test/Demian/';
const notice = { id: '318b5339-481f-4c16-a645-20861cb4d7c3', title: 'دمیان', body: 'خبر تازه', target: 'rewards' };

function worker(clients = []) {
    const handlers = new Map();
    const notifications = [];
    const opened = [];
    const self = {
        registration: { scope, showNotification: async (...args) => { notifications.push(args); } },
        addEventListener: (event, handler) => handlers.set(event, handler),
        clients: {
            matchAll: async () => clients,
            openWindow: async url => { opened.push(url); },
        },
    };
    runInNewContext(source, { self, URL });
    async function dispatch(type, event) {
        let work;
        handlers.get(type)({ ...event, waitUntil: job => { work = job; } });
        await work;
    }
    return { dispatch, notifications, opened };
}

test('browser push carries the same-origin Demian icons and fixed destination', async () => {
    const sw = worker();
    await sw.dispatch('push', { data: { json: () => notice } });
    assert.equal(sw.notifications.length, 1);
    const [title, options] = sw.notifications[0];
    assert.equal(title, notice.title);
    assert.equal(options.body, notice.body);
    assert.equal(options.icon, scope + 'icons/demian-192.png');
    assert.equal(options.badge, scope + 'icons/demian-notification-badge.png');
    assert.equal(options.image, scope + 'icons/demian-notification.png');
    assert.equal(options.tag, 'demian-' + notice.id);
    assert.equal(options.data.target, notice.target);
    await sw.dispatch('push', { data: { json: () => ({ ...notice, target: 'https://external.test/' }) } });
    assert.equal(sw.notifications.length, 1);
});

test('notification click cannot focus an unrelated application or open an external site', async () => {
    const sw = worker([{ url: scope + 'other.html', focus: () => assert.fail() }]);
    let closed = false;
    await sw.dispatch('notificationclick', {
        notification: { data: { target: 'https://external.test/' }, close: () => { closed = true; } },
    });
    assert.equal(closed, true);
    assert.deepEqual(sw.opened, [scope]);
    await sw.dispatch('notificationclick', { notification: { data: { target: 'leaderboard' }, close() {} } });
    assert.equal(sw.opened[1], scope + '#demian-notice=leaderboard');
});

test('existing game tab keeps its document and receives the selected screen', async () => {
    let focused = false;
    const posted = [];
    const sw = worker([{
        url: scope + 'index.html',
        focus: async () => { focused = true; },
        postMessage: message => posted.push(message),
    }]);
    await sw.dispatch('notificationclick', { notification: { data: { target: notice.target }, close() {} } });
    assert.equal(focused, true);
    assert.equal(posted[0]?.type, 'DEMIAN_PUSH_OPEN');
    assert.equal(posted[0]?.target, 'rewards');
    assert.equal(sw.opened.length, 0);
});
