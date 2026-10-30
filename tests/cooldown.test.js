// ============================================
// Next / Cancel With The Real Search Cooldown
// ============================================
// The other test files turn the 1.5 s cooldown off; this one keeps it,
// to check the screen never gets stuck on "Looking for someone…".

const { describe, test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, waitFor, staysQuiet, sleep } = require('./helpers');

const PORT = 5059;
const { connectSocket } = client(PORT);

let server;
let open = [];

before(async () => {
    server = await startServer({ port: PORT, env: { STRANGER_SEARCH_COOLDOWN_MS: '1500' } });
});

after(async () => {
    await server.stop();
});

afterEach(async () => {
    open.forEach(s => s.close());
    open = [];
    await sleep(150);
});

function sock() {
    const s = connectSocket();
    open.push(s);
    return s;
}

describe('search cooldown', () => {
    test('a search refused by the cooldown tells the client it ended', async () => {
        const s = sock();
        s.emit('stranger:search', {});
        await waitFor(s, 'stranger:searching');
        const ended = waitFor(s, 'stranger:ended');
        s.emit('stranger:search', {});
        await ended;
    });

    test('Next inside the cooldown still ends the chat for both people', async () => {
        const a = sock();
        const b = sock();
        a.emit('stranger:search', {});
        await waitFor(a, 'stranger:searching');
        const connected = Promise.all([waitFor(a, 'stranger:connected'), waitFor(b, 'stranger:connected')]);
        b.emit('stranger:search', {});
        await connected;

        const partnerLeft = waitFor(b, 'stranger:disconnected');
        const ended = waitFor(a, 'stranger:ended');
        a.emit('stranger:search', {});
        await Promise.all([partnerLeft, ended]);
    });

    test('Cancel always answers, even before the search was set up', async () => {
        const s = sock();
        const ended = waitFor(s, 'stranger:ended');
        s.emit('stranger:disconnect');
        await ended;
    });

    test('Cancel right after Start stops the search', async () => {
        const s = sock();
        s.emit('stranger:search', {});
        s.emit('stranger:disconnect');
        await waitFor(s, 'stranger:ended');
        assert.ok(await staysQuiet(s, 'stranger:searching', 500));
    });
});
