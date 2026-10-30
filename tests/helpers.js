// ============================================
// Test Helpers
// ============================================

// Starts the real BlinkTalk server against a throwaway in-memory MongoDB,
// so the tests need no local MongoDB installation.
// (The first run downloads a MongoDB binary, later runs use the cache.)

const { MongoMemoryServer } = require('mongodb-memory-server');
const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const path = require('path');

// Short timings and generous limits, so tests run fast and don't trip limits by accident.
// A test file can override any of these.
const TEST_ENV = {
    AUTH_RATE_LIMIT: '1000',
    ANON_DAILY_LIMIT: '1000',
    STRANGER_TAG_WAIT_MS: '300',
    STRANGER_FILTER_WAIT_MS: '600',
    STRANGER_SEARCH_COOLDOWN_MS: '0'
};

/**
 * Start MongoDB + the server. Resolves once the server is connected to the database.
 * Each test file uses its own port, because node:test runs files in parallel.
 * @param {Object} options - { port, env }
 * @returns {Promise<{ stop: Function, logs: Function }>}
 */
async function startServer({ port = 5055, env = {} } = {}) {
    const mongo = await MongoMemoryServer.create();
    const server = spawn(process.execPath, [path.join(__dirname, '../backend/server.js')], {
        env: {
            ...process.env,
            ...TEST_ENV,
            MONGODB_URI: mongo.getUri('blinktalk-test'),
            PORT: String(port),
            JWT_SECRET: 'test-secret',
            NODE_ENV: 'test',
            ...env
        }
    });

    let output = '';
    server.stdout.on('data', chunk => { output += chunk; });
    server.stderr.on('data', chunk => { output += chunk; });

    for (let i = 0; i < 300 && !output.includes('MongoDB Connected'); i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!output.includes('MongoDB Connected')) {
        server.kill();
        await mongo.stop();
        throw new Error('Server did not start:\n' + output);
    }

    return {
        logs: () => output,
        async stop() {
            server.kill();
            await mongo.stop();
        }
    };
}

/**
 * Wait for one socket event (fails after `ms` milliseconds)
 */
function waitFor(socket, event, ms = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), ms);
        socket.once(event, data => {
            clearTimeout(timer);
            resolve(data);
        });
    });
}

/**
 * Resolve true if the event does NOT arrive within `ms` milliseconds
 */
function staysQuiet(socket, event, ms = 400) {
    return new Promise(resolve => {
        const handler = () => { clearTimeout(timer); resolve(false); };
        const timer = setTimeout(() => { socket.off(event, handler); resolve(true); }, ms);
        socket.once(event, handler);
    });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Make two signed-up users friends the way people do in the app:
 * match in stranger chat (on a unique interest), request, accept, leave.
 */
async function befriend(a, b) {
    const tag = `friends-${randomUUID().slice(0, 8)}`;
    a.socket.emit('stranger:search', { interests: [tag] });
    await waitFor(a.socket, 'stranger:searching');
    const connected = Promise.all([waitFor(a.socket, 'stranger:connected'), waitFor(b.socket, 'stranger:connected')]);
    b.socket.emit('stranger:search', { interests: [tag] });
    await connected;

    const requested = waitFor(b.socket, 'stranger:friend:requested');
    a.socket.emit('stranger:friend:request');
    await requested;

    const added = Promise.all([waitFor(a.socket, 'stranger:friend:added'), waitFor(b.socket, 'stranger:friend:added')]);
    b.socket.emit('stranger:friend:accept');
    await added;

    const ended = waitFor(a.socket, 'stranger:ended');
    a.socket.emit('stranger:disconnect');
    await ended;
}

/**
 * Helpers bound to one server's port
 */
function client(port) {
    const baseUrl = `http://localhost:${port}`;

    /**
     * Call the REST API
     * @returns {Promise<{ status: Number, body: Object }>}
     */
    async function api(method, url, body, token) {
        const response = await fetch(baseUrl + url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { Authorization: `Bearer ${token}` })
            },
            body: body && JSON.stringify(body)
        });
        return { status: response.status, body: await response.json().catch(() => null) };
    }

    /**
     * Open a new socket connection. Every socket gets its own device id
     * unless one is given (like a separate browser).
     */
    function connectSocket({ deviceId = randomUUID(), token } = {}) {
        return io(baseUrl, {
            transports: ['websocket'],
            forceNew: true,
            auth: { deviceId, ...(token && { token }) }
        });
    }

    /**
     * Register a user and open an authenticated socket for them
     */
    async function createUser(username) {
        const { body } = await api('POST', '/api/auth/register', {
            username,
            email: `${username}@example.com`,
            password: 'Test123',
            confirmPassword: 'Test123',
            acceptedTerms: true
        });
        const socket = connectSocket();
        socket.emit('user:authenticate', { token: body.data.token });
        await waitFor(socket, 'user:authenticated');
        return { id: body.data.user._id, token: body.data.token, socket };
    }

    return { api, connectSocket, createUser };
}

// Default helpers for tests/api.test.js (port 5055)
const { api, connectSocket, createUser } = client(5055);

module.exports = { startServer, client, api, connectSocket, waitFor, staysQuiet, createUser, sleep, befriend };
