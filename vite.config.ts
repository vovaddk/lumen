/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// GitHub Pages serves the project at https://vovaddk.github.io/lumen/
export default defineConfig({
  base: '/lumen/',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
