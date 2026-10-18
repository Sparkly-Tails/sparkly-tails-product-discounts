import { defineConfig } from 'vitest/config'
import path from 'path'

/** For the live checks only (they talk to real dev stores); the normal `npm test` never loads them. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.live.ts'],
    testTimeout: 120000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
