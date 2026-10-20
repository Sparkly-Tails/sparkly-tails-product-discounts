import { describe, it } from 'vitest'
import { RuleTester } from 'eslint'
import plugin from '../../eslint-rules/guidelines.mjs'

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } })

describe('guidelines plugin', () => {
  tester.run('no-outer-scope-calls', plugin.rules['no-outer-scope-calls'], {
    valid: [
      'function build({ price, format }) { return format(price) }',
      'function parse(value) { return parseInt(value) }',
      'function outer() { function inner() { return 1 } return inner() }',
      'import { helper } from "./helper"; helper()',
      'const Panel = () => { const [open] = useState(false); return open }',
      'export async function GET() { return helper() }',
      'export default function Page() { return helper() }',
    ],
    invalid: [
      { code: 'import { helper } from "./helper"; function build(value) { return helper(value) }', errors: [{ messageId: 'outside' }] },
      { code: 'function other() { return 1 } function build() { return other() }', errors: [{ messageId: 'outside' }] },
      { code: 'function load() { return fetch("/cart.js") }', errors: [{ messageId: 'outside' }] },
      { code: 'function outer(run) { return [1].map(() => run()) }', errors: [{ messageId: 'outside' }] },
    ],
  })

  tester.run('no-outer-scope-reads', plugin.rules['no-outer-scope-reads'], {
    valid: [
      'const RATE = 2; function scale(value) { return value * RATE }',
      'const LIMITS = [1, 2]; function check(value) { return LIMITS.includes(value) }',
      'function top(value) { return Math.max(value, 1) }',
      'function find(root) { return root.querySelector("a") }',
      'function date({ now }) { return new Date(now) }',
      'export default function Page() { return document.title }',
      'export function POST() { return process.env.KEY }',
    ],
    invalid: [
      { code: 'function title() { return document.title }', errors: [{ messageId: 'outside' }] },
      { code: 'function width() { return window.innerWidth }', errors: [{ messageId: 'outside' }] },
      { code: 'let counter = 0; function bump() { counter += 1 }', errors: [{ messageId: 'outside' }] },
      { code: 'function scale(factor) { return [1].map((value) => value * factor) }', errors: [{ messageId: 'callback' }] },
      { code: 'function stamp() { return new Date() }', errors: [{ messageId: 'outside' }] },
    ],
  })

  tester.run('verb-function-names', plugin.rules['verb-function-names'], {
    valid: [
      'function computePrice() {}',
      'const isReady = () => true',
      'const buildCartChange = ({ items }) => items',
      'function Page() {}',
      'const LIMIT = () => 1',
    ],
    invalid: [
      { code: 'function perUnitPrice() {}', errors: [{ messageId: 'verb' }] },
      { code: 'const shopFromBody = () => 1', errors: [{ messageId: 'verb' }] },
      { code: 'class Cart { itemKey() {} }', errors: [{ messageId: 'verb' }] },
    ],
  })
})

describe('guidelines plugin with configured globals (as in the app)', () => {
  const withGlobals = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { document: 'readonly', window: 'readonly', fetch: 'readonly', Date: 'readonly' } } })
  withGlobals.run('no-outer-scope-reads', plugin.rules['no-outer-scope-reads'], {
    valid: ['function top(value) { return Math.max(value, 1) }', 'function date({ now }) { return new Date(now) }'],
    invalid: [
      { code: 'function title() { return document.title }', errors: [{ messageId: 'outside' }] },
      { code: 'function stamp() { return new Date() }', errors: [{ messageId: 'outside' }] },
    ],
  })
  withGlobals.run('no-outer-scope-calls', plugin.rules['no-outer-scope-calls'], {
    valid: ['function build({ load }) { return load() }'],
    invalid: [{ code: 'function load() { return fetch("/cart.js") }', errors: [{ messageId: 'outside' }] }],
  })
})
