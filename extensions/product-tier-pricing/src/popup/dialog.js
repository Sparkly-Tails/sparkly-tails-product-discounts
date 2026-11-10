// What the dialog does with the page's events: a click, Escape, closing. `state` is the pop-up's state (see ui.js).

/** Escape: the dialog closes through close(), so that everything that ends it ends it the same way. */
export function handleCancel({ state }, event) {
  event.preventDefault()
  state.dialog.close()
}

export function readControlView({ state, control }) {
  return state.views[Number(control.closest('[data-box]').dataset.index)]
}

/** A click on the backdrop (the dialog itself) closes; a click on a control with a data-action does what that action says. */
export function handleClick({ state, tools }, event) {
  if (event.target === state.dialog) state.dialog.close()
  const control = event.target.closest('[data-action]')
  if (control !== null) tools.actions[control.dataset.action]({ state, control, event, tools })
}

export function closeDialog({ state }) {
  state.dialog.close()
}

/** The Continue link: the customer goes on to checkout (the link itself is not followed, the core script does that). */
export function closeToCheckout({ state, event }) {
  event.preventDefault()
  state.action = 'continue'
  state.dialog.close()
}

/** The dialog has closed: the answer is given first, then everything the pop-up started is stopped and focus returns to the Checkout button. */
export function finishPopup({ state }) {
  state.resolve({ action: state.action, didAdd: state.didAdd || state.pendingAdds > 0 }) // an add still on its way counts: the cart is about to change
  state.win.clearInterval(state.timer)
  if (state.observer) state.observer.disconnect()
  state.dialog.remove()
  state.opener.focus()
}

export const DIALOG_TOOLS = { handleCancel, readControlView, handleClick, closeDialog, closeToCheckout, finishPopup }
