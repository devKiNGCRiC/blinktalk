import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The backend's PORT from the project's root .env (default 5000).
 * Only PORT is read: loading the whole file would pull in NODE_ENV=development
 * and make Vite bundle React's slower, larger development build.
 */
function backendPort() {
    if (process.env.PORT) return process.env.PORT;
    try {
        const rootEnv = fs.readFileSync(path.resolve(import.meta.dirname, '../.env'), 'utf8');
        return rootEnv.match(/^\s*PORT\s*=\s*(\d+)/m)?.[1] || 5000;
    } catch {
        return 5000;
    }
}

// During development the React app runs on :5173 and the Express server on PORT.
// The proxy forwards API and Socket.io traffic, so the browser sees one origin.
const apiTarget = `http://localhost:${backendPort()}`;

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': apiTarget,
            '/socket.io': { target: apiTarget, ws: true }
        }
    },
    test: {
        environment: 'node'
    }
});
