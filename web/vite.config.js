import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Lokal ishlab chiqish: npm run dev (API uchun bot serveri :3000 da ishlashi kerak)
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: { outDir: 'dist', sourcemap: false },
});
