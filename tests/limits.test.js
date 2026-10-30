// ============================================
// Limit Integration Tests
// ============================================
// A server with a small daily limit. All test sockets share one IP
// (127.0.0.1), so each match of two anonymous people adds 2 to the IP count.

const { describe, test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, waitFor, staysQuiet, sleep } = require('./helpers');

const PORT = 5058;
const { connectSocket, createUser } = client(PORT);

let server;
let open = [];

before(async () => {
    server = await startServer({ port: PORT, env: { ANON_DAILY_LIMIT: '4' } });
});

after(async () => {
    await server.stop();
});

afterEach(async () => {
    open.forEach(s => s.close());
    open = [];
    await sleep(150);
});

function sock(options) {
    const s = connectSocket(options);
    open.push(s);
    return s;
}

async function pair(a, b) {
    a.emit('stranger:search', {});
    await waitFor(a, 'stranger:searching');
    const both = Promise.all([waitFor(a, 'stranger:connected'), waitFor(b, 'stranger:connected')]);
    b.emit('stranger:search', {});
    return both;
}

describe('daily chat limit', () => {
    test('signed-up users are never counted', async () => {
        const [r1, r2, r3] = await Promise.all(['limreg1', 'limreg2', 'limreg3'].map(createUser));
        open.push(r1.socket, r2.socket, r3.socket);
        r1.socket.on('stranger:limit', () => assert.fail('signed-up user was limited'));

        await pair(r1.socket, r2.socket);
        r1.socket.emit('stranger:disconnect');
        await waitFor(r1.socket, 'stranger:ended');
        await pair(r1.socket, r3.socket);
        r2.socket.emit('stranger:disconnect');
        r3.socket.emit('stranger:disconnect');
        await sleep(100);
        await pair(r2.socket, r3.socket);
    });

    test('anonymous chats count per device and IP until the limit', async () => {
        // Two matches of two anonymous devices: IP count reaches 4
        for (let round = 0; round < 2; round++) {
            const a = sock({ deviceId: 'lim-dev-1' });
            const b = sock({ deviceId: 'lim-dev-2' });
            await pair(a, b);
            a.close();
            b.close();
            await sleep(150);
        }

        const third = sock({ deviceId: 'lim-dev-1' });
        const limit = waitFor(third, 'stranger:limit');
        third.emit('stranger:search', {});
        const info = await limit;
        assert.equal(info.limit, 4);
        assert.ok(new Date(info.resetsAt) > new Date());
        assert.ok(await staysQuiet(third, 'stranger:searching', 300));
    });
});
