import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://backend-seven-hazel-85.vercel.app',
        changeOrigin: true,
      },
    },
  },
});
