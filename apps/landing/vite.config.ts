import { defineConfig } from 'vite';

/** The static page at `/`. It builds first and owns the root of dist/; the web app adds dist/app. */
export default defineConfig({
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
