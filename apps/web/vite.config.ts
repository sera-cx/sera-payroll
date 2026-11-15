import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // VITE_BASE lets the same build live under a path, such as GitHub Pages' /sera-payroll/.
    base: env.VITE_BASE || '/',
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/v1': { target: 'http://localhost:4000', changeOrigin: true } },
    },
    build: { outDir: 'dist', sourcemap: true },
  };
});
