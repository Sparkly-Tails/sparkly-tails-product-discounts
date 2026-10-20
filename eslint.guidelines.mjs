// The owner's code guidelines as ESLint rules (docs/coding-guidelines.md):
// names of 3+ letters, at most 2 parameters, at most 2 branches, verb function
// names, nothing read or called from outside the function. Errors for every
// file except the legacy list, which only gets warnings.
import guidelines from './eslint-rules/guidelines.mjs'
import legacyFiles from './eslint.guidelines-legacy.mjs'

const TEST_FILES = ['**/*.test.*', '**/node_modules/**']

function buildRules({ level }) {
  return {
    'id-length': [level, { min: 3, properties: 'never' }],
    'max-params': [level, 2],
    complexity: [level, 3],
    'guidelines/no-outer-scope-reads': level,
    'guidelines/no-outer-scope-calls': level,
    'guidelines/verb-function-names': level,
  }
}

// `files`: the sources the guidelines apply to. `languageOptions`: only for
// files the app's own config does not already parse.
export function buildGuidelinesConfig({ files, languageOptions }) {
  const shared = { plugins: { guidelines }, ...(languageOptions ? { languageOptions } : {}) }
  return [
    { ...shared, files, ignores: [...TEST_FILES, ...legacyFiles], rules: buildRules({ level: 'error' }) },
    { ...shared, files: legacyFiles, rules: buildRules({ level: 'warn' }) },
  ]
}
