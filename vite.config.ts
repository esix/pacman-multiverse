import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    open: true,
    port: 3000,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
