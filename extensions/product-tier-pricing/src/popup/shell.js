// The frame of the pop-up (the view component): the dialog with its round close button, its header (heading, intro), and the list the boxes go in. The close button is also the way on to checkout.
import { POPUP_TEXT } from './copy.js'

const HEADING_ID = 'smooth-discounts-popup-heading'

export function buildCloseButton({ make }) {
  return make({ tag: 'button', name: 'close', text: POPUP_TEXT.closeSymbol, attrs: [['type', 'button'], ['aria-label', POPUP_TEXT.close], ['data-action', 'continue']] })
}

/** The header that scrolls with the boxes: the heading (which names the dialog) and a line of explanation. */
export function buildHeader({ make }) {
  const heading = make({ tag: 'h2', name: 'heading', text: POPUP_TEXT.heading, attrs: [['id', HEADING_ID]] })
  return make({ tag: 'div', name: 'header', kids: [heading, make({ tag: 'p', name: 'intro', text: POPUP_TEXT.intro })] })
}

/** `{ dialog, list, closeButton }`. */
export function buildDialog(tools, { doc }) {
  const make = tools.makeNode.bind(null, { doc, tools })
  const closeButton = tools.buildCloseButton({ make })
  const list = make({ tag: 'div', name: 'list', kids: [tools.buildHeader({ make })] })
  const panel = make({ tag: 'div', name: 'panel', kids: [closeButton, list] })
  return { dialog: make({ tag: 'dialog', name: 'dialog', attrs: [['aria-labelledby', HEADING_ID]], kids: [panel] }), list, closeButton }
}

export const SHELL_TOOLS = { buildCloseButton, buildHeader }
