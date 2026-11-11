import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any host or sub-path (GitHub Pages, itch.io, etc.).
  base: './',
  server: {
    host: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 4096,
  },
});
