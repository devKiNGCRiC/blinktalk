import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development the React app runs on :5173 and the Express server on :5000.
// The proxy forwards API and Socket.io traffic, so the browser sees one origin.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:5000',
            '/socket.io': { target: 'http://localhost:5000', ws: true }
        }
    },
    test: {
        environment: 'node'
    }
});
