// Lints the storefront source of the theme extension (extensions/product-tier-pricing/src), which the app's
// eslint.config.mjs ignores: it is plain browser JavaScript, not the app's modules.
import { buildGuidelinesConfig } from './eslint.guidelines.mjs'

export default buildGuidelinesConfig({
  files: ['extensions/product-tier-pricing/src/**/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
})
