// ESLint rules for the owner's code guidelines (docs/coding-guidelines.md).
// Three rules ESLint does not ship: function names are verbs, a function
// reads nothing from outside itself, a function calls nothing from outside
// itself. The length, parameter and branch rules are ESLint's own
// (id-length, max-params, complexity), set in eslint.guidelines.mjs.
//
// The rules are heuristics: the verb list is a list, and "outside" follows the
// "practical reading" the owner chose (built-ins and constants are allowed).
// Framework entry points keep their framework shape and are exempt: React
// components (PascalCase), default exports, HTTP route handlers (GET, POST...),
// and everything written inside them.

const BUILTIN_VALUES = new Set([
  'Math', 'JSON', 'Object', 'Array', 'Number', 'String', 'Boolean', 'Promise', 'Set', 'Map', 'WeakMap', 'WeakSet',
  'Error', 'TypeError', 'RangeError', 'RegExp', 'Symbol', 'BigInt', 'URL', 'URLSearchParams', 'undefined', 'NaN',
  'Infinity', 'console', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'Intl', 'Reflect', 'globalThis', 'arguments',
])

const BUILTIN_CALLS = new Set([
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'String', 'Number', 'Boolean', 'BigInt', 'Symbol', 'Array', 'Object',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'Error', 'TypeError',
])

const ROUTE_HANDLERS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

// To allow another verb, add it here.
const VERBS = new Set(`get set build compute paint render create update delete remove add find filter map reduce sort parse format validate check is has can should does will are load save fetch send handle apply resolve ensure extract merge split join clone copy convert normalize sanitize serialize deserialize encode decode verify sign refresh wire attach detach toggle open close show hide reset clear init initialize start stop run execute call invoke emit publish subscribe notify dispatch queue schedule retry wait delay measure count sum classify decide select pick choose group sync write read list lookup query search match compare diff replace insert append prepend push pop shift trim wrap unwrap pad escape unescape redirect forward bounce deny allow reject accept require assert expect throw log warn track register define declare configure enable disable activate deactivate purge rename move cancel confirm submit post put patch request respond reply return make prepare finalize assemble construct generate produce derive calculate estimate round clamp limit cap floor ceil truncate shorten expand collapse flatten order rank score review audit scan test try mark flag tag label name describe explain highlight focus blur press click tap scroll scale zoom resize position place align fill draw plot print stringify hash mask redact use with without only authenticate authorize bind unbind reload rebuild recompute repaint rerender revalidate revoke renew rotate seed skip strip tick tidy touch transform translate unlock lock upload download unregister unsubscribe watch dedupe increment decrement pluralize capitalize sleep spawn terminate teardown setup populate hydrate persist restore snapshot sample record rollback commit migrate dispose release acquire claim grant assign take give keep drop pass fail succeed finish complete begin end`.split(/\s+/))

function getFirstWord(name) {
  const match = /^[a-z]+/.exec(name)
  return match ? match[0] : ''
}

function isConstantValue(node) {
  if (!node) return false
  if (node.type === 'Literal') return true
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0
  if (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') return isConstantValue(node.expression)
  if (node.type === 'UnaryExpression') return isConstantValue(node.argument)
  if (node.type === 'ArrayExpression') return node.elements.every((element) => element && isConstantValue(element))
  if (node.type === 'ObjectExpression') {
    return node.properties.every((property) => property.type === 'Property' && isConstantValue(property.value))
  }
  return false
}

function getFunctionName(node) {
  if (node.id) return node.id.name
  const parent = node.parent
  if (parent && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name
  return null
}

// A function written by the framework's rules: component, default export,
// route handler.
function isEntryFunction(node) {
  const name = getFunctionName(node)
  if (name && (/^[A-Z][a-z]/.test(name) || ROUTE_HANDLERS.has(name))) return true
  const parent = node.parent
  return Boolean(parent && parent.type === 'ExportDefaultDeclaration')
}

function isInsideEntryFunction(sourceCode, node) {
  const chain = sourceCode.getAncestors(node).concat(node)
  return chain.some((item) => /Function/.test(item.type) && isEntryFunction(item))
}

// A name ESLint knows as a global (configured environment) has a variable but no definition.
function isGlobalName(variable) {
  return !variable || variable.defs.length === 0
}

function describeOutside({ variable, name }) {
  if (isGlobalName(variable)) return 'global ' + name
  const definition = variable.defs[0]
  if (definition && definition.type === 'ImportBinding') return 'import'
  const atModule = ['module', 'global'].includes(variable.scope.variableScope.type)
  if (!atModule) return 'enclosing-function variable ' + name
  if (!definition || definition.type !== 'Variable') return 'module function ' + name
  if (definition.parent.kind !== 'const') return 'mutable module variable ' + name
  if (isConstantValue(definition.node.init) || /^[A-Z][A-Z0-9_]*$/.test(name)) return null
  return 'module variable ' + name
}

function findVariable({ scope, name }) {
  let cursor = scope
  while (cursor) {
    const variable = cursor.set.get(name)
    if (variable) return variable
    cursor = cursor.upper
  }
  return null
}

const noOuterScopeReads = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      outside: 'Reads {{what}} from outside the function; pass it in as a parameter.',
      callback: 'A callback reads {{what}} from its enclosing function; pass it in or move the callback out.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    function checkReference({ reference, functionScope }) {
      const name = reference.identifier.name
      const variable = reference.resolved
      if (variable && variable.scope.variableScope === functionScope) return
      if (isGlobalName(variable) && BUILTIN_VALUES.has(name)) return
      const parent = reference.identifier.parent
      if (isGlobalName(variable) && name === 'Date' && parent.type === 'NewExpression' && parent.arguments.length > 0) return
      const what = describeOutside({ variable, name })
      if (what === null || what === 'import' || what.startsWith('module function')) return
      if (parent.type === 'CallExpression' && parent.callee === reference.identifier) return
      const block = functionScope.block
      const isCallback = block.parent && block.parent.type === 'CallExpression' && block.parent.arguments.includes(block)
      const messageId = isCallback && what.startsWith('enclosing') ? 'callback' : 'outside'
      context.report({ node: reference.identifier, messageId, data: { what } })
    }
    return {
      'Program:exit'() {
        for (const scope of sourceCode.scopeManager.scopes) {
          const functionScope = scope.variableScope
          if (functionScope.type !== 'function') continue
          if (isInsideEntryFunction(sourceCode, functionScope.block)) continue
          for (const reference of scope.references) {
            if (!reference.isTypeReference) checkReference({ reference, functionScope })
          }
        }
      },
    }
  },
}

const noOuterScopeCalls = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { outside: 'Calls {{what}} from outside the function; pass the function in as a parameter.' },
  },
  create(context) {
    const sourceCode = context.sourceCode
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return
        const name = node.callee.name
        if (BUILTIN_CALLS.has(name) || /^use[A-Z]/.test(name)) return
        const scope = sourceCode.getScope(node)
        if (['module', 'global'].includes(scope.variableScope.type)) return
        if (isInsideEntryFunction(sourceCode, node)) return
        const variable = findVariable({ scope, name })
        if (variable && variable.scope.variableScope === scope.variableScope) return
        const kind = variable && variable.defs[0] && variable.defs[0].type === 'ImportBinding' ? 'the imported' : 'the outer'
        const what = isGlobalName(variable) ? 'the global function ' + name : kind + ' function ' + name
        context.report({ node: node.callee, messageId: 'outside', data: { what } })
      },
    }
  },
}

const verbFunctionNames = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: { verb: 'Function name "{{name}}" must start with a verb (see eslint-rules/guidelines.mjs for the list).' },
  },
  create(context) {
    function checkName({ node, name }) {
      if (!name || /^[A-Z]/.test(name) || name === 'default') return
      if (!VERBS.has(getFirstWord(name))) context.report({ node, messageId: 'verb', data: { name } })
    }
    function isFunctionValue(node) {
      return Boolean(node) && (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression')
    }
    return {
      FunctionDeclaration(node) {
        if (node.id) checkName({ node: node.id, name: node.id.name })
      },
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && isFunctionValue(node.init)) checkName({ node: node.id, name: node.id.name })
      },
      MethodDefinition(node) {
        if (node.key.type === 'Identifier' && node.kind === 'method') checkName({ node: node.key, name: node.key.name })
      },
    }
  },
}

export default {
  rules: {
    'no-outer-scope-reads': noOuterScopeReads,
    'no-outer-scope-calls': noOuterScopeCalls,
    'verb-function-names': verbFunctionNames,
  },
}
