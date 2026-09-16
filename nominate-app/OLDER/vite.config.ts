import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// In dev, the React app is served by Vite (npm run dev, port 5000) while the
// JSON-file API lives in its own small Node process (npm run server, port
// 5001 by default — see server.js). The proxy below stitches the two
// together so the browser only ever talks to one origin.
//
// In production there's no proxy needed: `npm run build` then `npm start`
// serves the built frontend AND the /api/* routes from the same process,
// on the same port — exactly like the dullas/standup servers do.
const API_PORT = process.env.API_PORT || 5001;

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/.local/**', '**/node_modules/**'],
      },
      proxy: {
        '/api': `http://localhost:${API_PORT}`,
      },
    },
  };
});
