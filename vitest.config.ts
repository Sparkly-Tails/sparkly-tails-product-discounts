import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    // extensions/** is the Shopify Function's own Rust/Node project (its own
    // package.json + vitest devDependency); it is not installed into this
    // app's node_modules and must not be picked up by the root test run.
    // .claude/worktrees/** holds other in-progress worktrees living on disk
    // alongside this repo — their test files belong to different branches
    // and must never be picked up by a run from this checkout.
    exclude: [...configDefaults.exclude, 'extensions/**', '.claude/worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
