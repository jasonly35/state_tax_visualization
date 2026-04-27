/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Repo name for GitHub Pages base path. Override via VITE_BASE env at build time.
const base = process.env.VITE_BASE ?? '/state_tax_visualization/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
