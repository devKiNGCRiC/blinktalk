// ============================================
// Test Helpers
// ============================================

// Starts the real BlinkTalk server against a throwaway in-memory MongoDB,
// so the tests need no local MongoDB installation.
// (The first run downloads a MongoDB binary, later runs use the cache.)

const { MongoMemoryServer } = require('mongodb-memory-server');
const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 5055;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Start MongoDB + the server. Resolves once the server is connected to the database.
 * @returns {Promise<{ stop: Function, logs: Function }>}
 */
async function startServer() {
    const mongo = await MongoMemoryServer.create();

    const server = spawn(process.execPath, [path.join(__dirname, '../backend/server.js')], {
        env: {
            ...process.env,
            MONGODB_URI: mongo.getUri('blinktalk-test'),
            PORT: String(PORT),
            JWT_SECRET: 'test-secret',
            NODE_ENV: 'test'
        }
    });

    let output = '';
    server.stdout.on('data', chunk => { output += chunk; });
    server.stderr.on('data', chunk => { output += chunk; });

    // Wait up to 30 seconds for "MongoDB Connected"
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
 * Call the REST API
 * @returns {Promise<{ status: Number, body: Object }>}
 */
async function api(method, url, body, token) {
    const response = await fetch(BASE_URL + url, {
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
 * Open a new socket connection
 */
function connectSocket() {
    return io(BASE_URL, { transports: ['websocket'], forceNew: true });
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

/**
 * Register a user and open an authenticated socket for them
 */
async function createUser(username) {
    const { body } = await api('POST', '/api/auth/register', {
        username,
        email: `${username}@example.com`,
        password: 'Test123',
        confirmPassword: 'Test123'
    });
    const socket = connectSocket();
    socket.emit('user:authenticate', { token: body.data.token });
    await waitFor(socket, 'user:authenticated');
    return { id: body.data.user._id, token: body.data.token, socket };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { startServer, api, connectSocket, waitFor, staysQuiet, createUser, sleep };
