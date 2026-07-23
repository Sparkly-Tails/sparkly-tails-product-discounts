import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    // extensions/** is the Shopify Function's own Rust/Node project (its own
    // package.json + vitest devDependency); it is not installed into this
    // app's node_modules and must not be picked up by the root test run.
    exclude: [...configDefaults.exclude, 'extensions/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
