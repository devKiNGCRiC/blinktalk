// ============================================
// BlinkTalk Integration Tests
// ============================================
// Run with: npm test
// Tests the real server (REST API + Socket.io) against an in-memory MongoDB.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, api, connectSocket, waitFor, staysQuiet, createUser, sleep } = require('./helpers');

let server;
const openSockets = [];

before(async () => {
    server = await startServer();
});

after(async () => {
    openSockets.forEach(socket => socket.close());
    await server.stop();
});

// Keep track of sockets so they are closed at the end
async function user(name) {
    const u = await createUser(name);
    openSockets.push(u.socket);
    return u;
}
function socket() {
    const s = connectSocket();
    openSockets.push(s);
    return s;
}

// ============================================
// Server & Auth
// ============================================

describe('server and authentication', () => {
    test('health check responds', async () => {
        const { body } = await api('GET', '/api');
        assert.equal(body.success, true);
    });

    test('unknown API routes return JSON 404', async () => {
        const { status, body } = await api('GET', '/api/nope');
        assert.equal(status, 404);
        assert.equal(body.success, false);
    });

    test('register, login (dotted gmail) and verify', async () => {
        const reg = await api('POST', '/api/auth/register', {
            username: 'dotty', email: 'dot.ty@gmail.com', password: 'Test123', confirmPassword: 'Test123'
        });
        assert.equal(reg.status, 201);

        const login = await api('POST', '/api/auth/login', { identifier: 'dot.ty@gmail.com', password: 'Test123' });
        assert.equal(login.status, 200);

        const verify = await api('GET', '/api/auth/verify', null, login.body.data.token);
        assert.equal(verify.body.data.user.username, 'dotty');
    });

    test('weak password and wrong password are rejected', async () => {
        const weak = await api('POST', '/api/auth/register', {
            username: 'weakling', email: 'weak@example.com', password: 'abc', confirmPassword: 'abc'
        });
        assert.equal(weak.status, 400);

        const wrong = await api('POST', '/api/auth/login', { identifier: 'dotty', password: 'Wrong123' });
        assert.equal(wrong.status, 401);
    });

    test('protected routes need a token', async () => {
        assert.equal((await api('GET', '/api/users/contacts')).status, 401);
    });

    test('socket rejects a raw user ID (no impersonation)', async () => {
        const s = socket();
        s.emit('user:authenticate', { userId: '507f1f77bcf86cd799439011' });
        const error = await waitFor(s, 'error');
        assert.equal(error.message, 'Authentication failed');
    });

    test('theme preference can be saved', async () => {
        const u = await user('themer');
        const res = await api('PUT', '/api/users/profile', { preferences: { theme: 'y2k' }, bio: 'hi' }, u.token);
        assert.equal(res.status, 200);
        assert.equal(res.body.data.user.preferences.theme, 'y2k');
        assert.equal(res.body.data.user.preferences.sounds, true); // other keys untouched

        const bad = await api('PUT', '/api/users/profile', { preferences: { theme: 'neon-nope' } }, u.token);
        assert.equal(bad.status, 400);
    });
});

// ============================================
// Private Messaging
// ============================================

describe('private messaging', () => {
    let alice, bob;

    before(async () => {
        alice = await user('alice');
        bob = await user('bob');
    });

    test('user search finds people and escapes regex characters', async () => {
        const found = await api('GET', '/api/users/search?q=bo', null, alice.token);
        assert.ok(found.body.data.users.some(u => u.username === 'bob'));

        const weird = await api('GET', '/api/users/search?q=' + encodeURIComponent('(['), null, alice.token);
        assert.equal(weird.status, 200);
    });

    test('message is delivered live and confirmed with tempId', async () => {
        const received = waitFor(bob.socket, 'message:received');
        const sent = waitFor(alice.socket, 'message:sent');
        alice.socket.emit('message:private', { receiverId: bob.id, content: 'hi bob', tempId: 't1' });

        const [incoming, confirmation] = await Promise.all([received, sent]);
        assert.equal(incoming.content, 'hi bob');
        assert.equal(confirmation.tempId, 't1');
        assert.equal(confirmation.isDelivered, true); // bob is online
    });

    test('empty messages are rejected with message:error', async () => {
        const error = waitFor(alice.socket, 'message:error');
        alice.socket.emit('message:private', { receiverId: bob.id, content: '   ', tempId: 't-empty' });
        assert.equal((await error).tempId, 't-empty');
    });

    test('typing indicator reaches the other user', async () => {
        const typing = waitFor(bob.socket, 'typing:start');
        alice.socket.emit('typing:start', { receiverId: bob.id });
        assert.equal((await typing).userId, alice.id);
    });

    test('contacts show unread count, and read receipts clear it', async () => {
        let contacts = await api('GET', '/api/users/contacts', null, bob.token);
        const fromAlice = contacts.body.data.contacts.find(c => c.user.username === 'alice');
        assert.equal(fromAlice.unreadCount, 1);

        const receipt = waitFor(alice.socket, 'messages:read');
        bob.socket.emit('messages:read', { userId: alice.id });
        assert.equal((await receipt).by, bob.id);

        contacts = await api('GET', '/api/users/contacts', null, bob.token);
        assert.equal(contacts.body.data.contacts.find(c => c.user.username === 'alice').unreadCount, 0);
    });

    test('reply includes the quoted message', async () => {
        const history = await api('GET', `/api/messages/${alice.id}`, null, bob.token);
        const original = history.body.data.messages[0];

        const received = waitFor(alice.socket, 'message:received');
        bob.socket.emit('message:private', { receiverId: alice.id, content: 'hey!', replyTo: original._id, tempId: 't2' });
        const reply = await received;
        assert.equal(reply.replyTo.content, 'hi bob');
        assert.equal(reply.replyTo.sender.username, 'alice');
    });

    test('messages sent while offline are marked delivered on login', async () => {
        const carol = await user('carol');
        carol.socket.close();
        await sleep(200);

        const sent = waitFor(alice.socket, 'message:sent');
        alice.socket.emit('message:private', { receiverId: carol.id, content: 'you there?', tempId: 't3' });
        const message = await sent;
        assert.equal(message.isDelivered, false);

        const delivered = waitFor(alice.socket, 'message:delivered');
        const carolAgain = socket();
        carolAgain.emit('user:authenticate', { token: carol.token });
        const event = await delivered;
        assert.deepEqual(event.messageIds, [message._id]);
    });

    test('delete for me hides only for me; delete for everyone blanks for both', async () => {
        const sent = waitFor(alice.socket, 'message:sent');
        alice.socket.emit('message:private', { receiverId: bob.id, content: 'oops', tempId: 't4' });
        const message = await sent;

        // Delete for me (bob)
        const mine = waitFor(bob.socket, 'message:deleted');
        bob.socket.emit('message:delete', { messageId: message._id, scope: 'me' });
        assert.equal((await mine).scope, 'me');
        let bobHistory = await api('GET', `/api/messages/${alice.id}`, null, bob.token);
        assert.ok(!bobHistory.body.data.messages.some(m => m._id === message._id));
        let aliceHistory = await api('GET', `/api/messages/${bob.id}`, null, alice.token);
        assert.ok(aliceHistory.body.data.messages.some(m => m._id === message._id));

        // Bob cannot delete alice's message for everyone
        const denied = waitFor(bob.socket, 'error');
        bob.socket.emit('message:delete', { messageId: message._id, scope: 'everyone' });
        assert.match((await denied).message, /Only the sender/);

        // Alice deletes for everyone
        const everyone = waitFor(bob.socket, 'message:deleted');
        alice.socket.emit('message:delete', { messageId: message._id, scope: 'everyone' });
        assert.equal((await everyone).scope, 'everyone');
        aliceHistory = await api('GET', `/api/messages/${bob.id}`, null, alice.token);
        const tombstone = aliceHistory.body.data.messages.find(m => m._id === message._id);
        assert.equal(tombstone.isDeleted, true);
        assert.equal(tombstone.content, '');
    });
});

// ============================================
// Rooms
// ============================================

describe('rooms', () => {
    let owner, member, outsider, roomId;

    before(async () => {
        owner = await user('roomowner');
        member = await user('roommember');
        outsider = await user('outsider');
    });

    test('create, search and join a public room', async () => {
        const created = await api('POST', '/api/rooms', { name: 'Cricket Fans', description: 'IPL talk', type: 'public' }, owner.token);
        assert.equal(created.status, 201);
        roomId = created.body.data.room._id;

        const search = await api('GET', '/api/rooms/search?q=Cricket', null, member.token);
        assert.equal(search.body.data.rooms.length, 1);

        assert.equal((await api('POST', `/api/rooms/${roomId}/join`, {}, member.token)).status, 200);
    });

    test('room messages reach members, with sender confirmation', async () => {
        member.socket.emit('room:join', { roomId });
        await sleep(200);

        const received = waitFor(member.socket, 'message:room:received');
        const sent = waitFor(owner.socket, 'message:sent');
        owner.socket.emit('message:room', { roomId, content: 'welcome!', tempId: 'r1' });

        const [incoming, confirmation] = await Promise.all([received, sent]);
        assert.equal(incoming.content, 'welcome!');
        assert.equal(incoming.room, roomId);
        assert.equal(confirmation.tempId, 'r1');
    });

    test('members are auto-joined to their rooms when they connect', async () => {
        const fresh = socket();
        fresh.emit('user:authenticate', { token: member.token });
        await waitFor(fresh, 'user:authenticated');

        const received = waitFor(fresh, 'message:room:received');
        owner.socket.emit('message:room', { roomId, content: 'auto-joined?', tempId: 'r2' });
        assert.equal((await received).content, 'auto-joined?');
    });

    test('non-members cannot read or post', async () => {
        assert.equal((await api('GET', `/api/messages/room/${roomId}`, null, outsider.token)).status, 403);

        const error = waitFor(outsider.socket, 'message:error');
        outsider.socket.emit('message:room', { roomId, content: 'let me in', tempId: 'r3' });
        assert.equal((await error).tempId, 'r3');
    });

    test('room list shows the last message with its sender', async () => {
        const rooms = await api('GET', '/api/rooms', null, member.token);
        const room = rooms.body.data.rooms.find(r => r._id === roomId);
        assert.equal(room.lastMessage.content, 'auto-joined?');
        assert.equal(room.lastMessage.sender.username, 'roomowner');
    });

    test('history includes the join system message', async () => {
        const history = await api('GET', `/api/messages/room/${roomId}`, null, member.token);
        assert.ok(history.body.data.messages.some(m => m.type === 'system'));
    });
});

// ============================================
// Anonymous Stranger Chat
// ============================================

describe('stranger chat', () => {
    test('match, message, typing, next and leave', async () => {
        const x = socket();
        const y = socket();
        const z = socket();

        // x waits, y matches with x
        x.emit('stranger:search', {});
        await waitFor(x, 'stranger:searching');
        const xConnected = waitFor(x, 'stranger:connected');
        const yConnected = waitFor(y, 'stranger:connected');
        y.emit('stranger:search', {});
        await Promise.all([xConnected, yConnected]);

        // Messages and typing
        const message = waitFor(y, 'stranger:message');
        x.emit('stranger:message', { content: 'hey stranger' });
        const got = await message;
        assert.equal(got.content, 'hey stranger');
        assert.equal(got.from, 'stranger');

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

        // y (no partner now) gets nothing from x's old session
        assert.ok(await staysQuiet(y, 'stranger:message'));
    });
});
