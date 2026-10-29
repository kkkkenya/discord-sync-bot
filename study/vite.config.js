import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `npm run dev` serves the UI with hot reload on :5173 and sends /api to the running server (npm start).
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:5190' } },
});
