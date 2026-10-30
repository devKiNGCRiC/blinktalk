// ============================================
// Stranger Chat Integration Tests
// ============================================
// Real server + in-memory MongoDB on its own port.

const { describe, test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, waitFor, staysQuiet, sleep } = require('./helpers');

const PORT = 5057;
const { api, connectSocket, createUser } = client(PORT);

let server;
let open = [];

before(async () => {
    server = await startServer({ port: PORT });
});

after(async () => {
    await server.stop();
});

// Close this test's sockets and give the server a moment to clear the queue
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

async function user(name) {
    const u = await createUser(name);
    open.push(u.socket);
    return u;
}

/** a waits, then b searches; resolves with both stranger:connected payloads */
async function pair(a, b, searchA = {}, searchB = {}) {
    a.emit('stranger:search', searchA);
    await waitFor(a, 'stranger:searching');
    const aConnected = waitFor(a, 'stranger:connected');
    const bConnected = waitFor(b, 'stranger:connected');
    b.emit('stranger:search', searchB);
    return Promise.all([aConnected, bConnected]);
}

describe('stranger chat', () => {
    test('match, message, typing, next and leave', async () => {
        const x = sock();
        const y = sock();
        const z = sock();

        const [xInfo] = await pair(x, y);
        assert.equal(typeof xInfo.icebreaker, 'string');
        assert.deepEqual(xInfo.partner, { registered: false });

        const message = waitFor(y, 'stranger:message');
        x.emit('stranger:message', { content: 'hey stranger' });
        const got = await message;
        assert.equal(got.content, 'hey stranger');
        assert.equal(got.from, 'stranger');
        assert.ok(got.id);

        const typing = waitFor(y, 'stranger:typing');
        x.emit('stranger:typing');
        await typing;

        // x presses "Next": y is told x left, x searches again
        const yLeft = waitFor(y, 'stranger:disconnected');
        x.emit('stranger:search', {});
        await yLeft;
        await waitFor(x, 'stranger:searching');

        // z matches with x
        const xAgain = waitFor(x, 'stranger:connected');
        z.emit('stranger:search', {});
        await xAgain;

        // x leaves: gets stranger:ended, z gets stranger:disconnected
        const xEnded = waitFor(x, 'stranger:ended');
        const zLeft = waitFor(z, 'stranger:disconnected');
        x.emit('stranger:disconnect');
        await Promise.all([xEnded, zLeft]);

        assert.ok(await staysQuiet(y, 'stranger:message'));
    });

    test('shared interests match, different interests match after the tag wait', async () => {
        await pair(sock(), sock(), { interests: ['Music'] }, { interests: ['music'] });
        await pair(sock(), sock(), { interests: ['cricket'] }, { interests: ['anime'] });
    });

    test('a signed-up partner shows their name; an anonymous one shows nothing', async () => {
        const member = await user('strangerreg1');
        const anon = sock();
        const [memberInfo, anonInfo] = await pair(member.socket, anon);
        assert.deepEqual(memberInfo.partner, { registered: false });
        assert.equal(anonInfo.partner.registered, true);
        assert.equal(anonInfo.partner.userId, member.id);
        assert.equal(anonInfo.partner.displayName, 'strangerreg1');
    });

    test('bad words are masked; only signed-up users can send links', async () => {
        const member = await user('strangerreg2');
        const anon = sock();
        await pair(member.socket, anon);

        const toMember = waitFor(member.socket, 'stranger:message');
        const echo = waitFor(anon, 'stranger:message');
        anon.emit('stranger:message', { content: 'idiot see google.com' });
        assert.equal((await toMember).content, '***** see [link removed]');
        assert.equal((await echo).from, 'you');

        const toAnon = waitFor(anon, 'stranger:message');
        member.socket.emit('stranger:message', { content: 'check https://x.io' });
        assert.equal((await toAnon).content, 'check https://x.io');
    });

    test('a burst of messages is rate limited', async () => {
        const a = sock();
        const b = sock();
        await pair(a, b);

        let received = 0;
        b.on('stranger:message', () => { received++; });
        const limited = waitFor(a, 'stranger:rate-limited');
        for (let i = 0; i < 6; i++) a.emit('stranger:message', { content: `m${i}` });
        await limited;
        await sleep(400);
        assert.equal(received, 5);
    });

    test('garbage search payloads are cleaned up, and the server keeps running', async () => {
        for (const payload of [{ interests: 5 }, { interests: Array(500).fill('x') }, null, { filters: 'x' }]) {
            const s = sock();
            s.emit('stranger:search', payload);
            await waitFor(s, 'stranger:searching');
            s.close();
            await sleep(50);
        }
        const { body } = await api('GET', '/api');
        assert.equal(body.success, true);
    });

    test('two tabs on the same device are never matched', async () => {
        const a = sock({ deviceId: 'same-device' });
        const b = sock({ deviceId: 'same-device' });
        a.emit('stranger:search', {});
        await waitFor(a, 'stranger:searching');
        b.emit('stranger:search', {});
        assert.ok(await staysQuiet(a, 'stranger:connected', 800));
    });

    test('a filter with no match asks to widen; widening connects', async () => {
        const member = await user('strangerreg3');
        const anon = sock();
        member.socket.emit('stranger:search', { filters: { gender: 'female' } });
        await waitFor(member.socket, 'stranger:searching');
        anon.emit('stranger:search', {});
        await waitFor(member.socket, 'stranger:no-match');

        const connected = Promise.all([waitFor(member.socket, 'stranger:connected'), waitFor(anon, 'stranger:connected')]);
        member.socket.emit('stranger:widen');
        await connected;
    });

    test('online count is available on request', async () => {
        const a = sock();
        sock();
        const stats = waitFor(a, 'stats:online');
        a.emit('stats:get');
        assert.ok((await stats).count >= 2);
    });

    test('reactions are relayed to the partner', async () => {
        const a = sock();
        const b = sock();
        await pair(a, b);
        const message = waitFor(b, 'stranger:message');
        a.emit('stranger:message', { content: 'react to this' });
        const { id } = await message;

        const reaction = waitFor(a, 'stranger:reaction');
        b.emit('stranger:react', { messageId: id, emoji: '😂' });
        assert.deepEqual(await reaction, { messageId: id, emoji: '😂', from: 'stranger' });

        b.emit('stranger:react', { messageId: id, emoji: '💩' });
        assert.ok(await staysQuiet(a, 'stranger:reaction'));
    });

    // Last: the ban also covers the shared test IP
    test('three reports from different people ban the reported device', async () => {
        const target = sock({ deviceId: 'troll-device' });
        for (let i = 0; i < 3; i++) {
            const reporter = sock();
            await pair(target, reporter);
            const ended = waitFor(reporter, 'stranger:ended');
            const left = waitFor(target, 'stranger:disconnected');
            const banned = i === 2 && waitFor(target, 'stranger:banned');
            reporter.emit('stranger:report', { reason: 'spam' });
            await Promise.all([ended, left]);
            if (banned) assert.ok(new Date((await banned).until) > new Date());
        }

        const again = waitFor(target, 'stranger:banned');
        target.emit('stranger:search', {});
        await again;
    });
});
