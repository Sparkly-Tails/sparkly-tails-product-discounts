// The frame of the pop-up (the view component): the dialog with its heading, close button, empty list and the Continue link under it.
import { POPUP_TEXT } from './copy.js'
import { buildRootPath } from './path.js'

const HEADING_ID = 'smooth-discounts-popup-heading'

/** `{ dialog, list, closeButton }`. The Continue link goes to the checkout address under the shop's root link. */
export function buildDialog(tools, { doc, boxCount, root }) {
  const make = tools.makeNode.bind(null, { doc, tools })
  const closeButton = make({ tag: 'button', name: 'close', text: POPUP_TEXT.close, attrs: [['type', 'button'], ['data-action', 'close']] })
  const list = make({ tag: 'div', name: 'list' })
  const heading = make({ tag: 'h2', name: 'heading', text: tools.buildHeadingText({ boxCount }), attrs: [['id', HEADING_ID]] })
  const link = make({ tag: 'a', name: 'continue', text: POPUP_TEXT.continue, attrs: [['href', tools.buildRootPath({ rootUrl: root, path: 'checkout' })], ['data-action', 'continue']] })
  const header = make({ tag: 'div', name: 'header', kids: [heading, closeButton] })
  const panel = make({ tag: 'div', name: 'panel', kids: [header, list, make({ tag: 'div', name: 'footer', kids: [link] })] })
  return { dialog: make({ tag: 'dialog', name: 'dialog', attrs: [['aria-labelledby', HEADING_ID]], kids: [panel] }), list, closeButton }
}

export const SHELL_TOOLS = { buildRootPath }
