// Building page elements from plain descriptions. The text is always set as text, never as markup: what the shop sends (titles, names) cannot add elements.
const EMPTY_SPEC = { name: '', text: '', attrs: [], kids: [] }
const CLASS_PREFIX = 'smooth-discounts-popup__'

export function setAttribute(element, pair) {
  element.setAttribute(pair[0], pair[1])
}

export function appendNode(parent, child) {
  parent.appendChild(child)
}

export function isNode(value) {
  return value !== null
}

/** An element from `{ tag, name, text, attrs, kids }` (all but `tag` optional): `name` is the class without the prefix, `attrs` a list of [name, value] pairs, `kids` a list of elements (a null is left out). */
export function makeNode({ doc, tools }, spec) {
  const { tag, name, text, attrs, kids } = Object.assign({}, EMPTY_SPEC, spec)
  const element = doc.createElement(tag)
  element.className = name ? CLASS_PREFIX + name : ''
  element.textContent = text
  attrs.forEach(tools.setAttribute.bind(null, element))
  kids.filter(tools.isNode).forEach(tools.appendNode.bind(null, element))
  return element
}

export const NODE_TOOLS = { setAttribute, appendNode, isNode, makeNode }
