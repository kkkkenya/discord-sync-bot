import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const version = new Date().toISOString().replace(/\D/g, '').slice(0, 12); // the build's time, e.g. 202611011145

// `npm run dev` serves the UI with hot reload on :5173 and sends /api to the local API (server/index.js).
export default defineConfig({
  root: 'web',
  define: { __CRUX_VERSION__: JSON.stringify(version) },
  plugins: [react(), {
    name: 'crux-version', // version.json tells an open app which build is live
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) }); },
  }],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:5190' } },
});
