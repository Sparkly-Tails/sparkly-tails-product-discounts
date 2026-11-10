// The frame of the pop-up (the view component): the dialog with its round close button, its header (eyebrow, heading, intro), the list the boxes go in, and the Continue link under it.
import { POPUP_TEXT } from './copy.js'
import { buildRootPath } from './path.js'

const HEADING_ID = 'smooth-discounts-popup-heading'

export function buildCloseButton({ make }) {
  return make({ tag: 'button', name: 'close', text: POPUP_TEXT.closeSymbol, attrs: [['type', 'button'], ['aria-label', POPUP_TEXT.close], ['data-action', 'close']] })
}

/** The header that scrolls with the boxes: a small label, the heading (which names the dialog) and a line of explanation. */
export function buildHeader({ make }) {
  const heading = make({ tag: 'h2', name: 'heading', text: POPUP_TEXT.heading, attrs: [['id', HEADING_ID]] })
  return make({ tag: 'div', name: 'header', kids: [make({ tag: 'p', name: 'eyebrow', text: POPUP_TEXT.eyebrow }), heading, make({ tag: 'p', name: 'intro', text: POPUP_TEXT.intro })] })
}

/** `{ dialog, list, closeButton }`. The Continue link goes to the checkout address under the shop's root link. */
export function buildDialog(tools, { doc, root }) {
  const make = tools.makeNode.bind(null, { doc, tools })
  const closeButton = tools.buildCloseButton({ make })
  const list = make({ tag: 'div', name: 'list', kids: [tools.buildHeader({ make })] })
  const link = make({ tag: 'a', name: 'continue', text: POPUP_TEXT.continue, attrs: [['href', tools.buildRootPath({ rootUrl: root, path: 'checkout' })], ['data-action', 'continue']] })
  const panel = make({ tag: 'div', name: 'panel', kids: [closeButton, list, make({ tag: 'div', name: 'footer', kids: [link] })] })
  return { dialog: make({ tag: 'dialog', name: 'dialog', attrs: [['aria-labelledby', HEADING_ID]], kids: [panel] }), list, closeButton }
}

export const SHELL_TOOLS = { buildRootPath, buildCloseButton, buildHeader }
