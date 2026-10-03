import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = `http://localhost:${process.env.API_PORT ?? 8787}`;

/** The web app lives at /app on the one origin (architecture §5.2). */
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  // VERCEL_ENV tells a production build to leave the component gallery out (src/app/routes.tsx).
  envPrefix: ['VITE_', 'VERCEL_ENV'],
  build: {
    outDir: '../../dist/app',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': API,
      '/mcp': API,
      '/.well-known': API,
    },
  },
});
