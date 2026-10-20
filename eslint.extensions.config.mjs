// Lints the storefront scripts of the theme extension, which the app's
// eslint.config.mjs ignores (they are plain browser scripts, not modules).
import { buildGuidelinesConfig } from './eslint.guidelines.mjs'

export default buildGuidelinesConfig({
  files: ['extensions/product-tier-pricing/assets/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'script' },
})
