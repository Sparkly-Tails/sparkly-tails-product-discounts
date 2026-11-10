// Carrying on after the pop-up: the stopped Checkout press goes ahead, or the page is refreshed. `win` is the page's window.

/** Where Checkout leads when nothing was added: 'form' for a button of a form, 'link' for a link, else the checkout address. */
export function readTargetKind({ target }) {
  return target.form ? 'form' : target.href ? 'link' : 'checkout'
}

/** 'checkout' after an add (the cart form on the page holds the old quantities, checkout reads the cart on the server), else what the pressed control is. */
export function readResumeKind({ target, didAdd, tools }) {
  return didAdd ? 'checkout' : tools.readTargetKind({ target })
}

export function redirectToCheckout({ win, rootUrl, tools }) {
  win.location.assign(tools.buildRootPath({ rootUrl, path: 'checkout' }))
}

export function openLink({ win, target }) {
  win.location.assign(target.href)
}

/** Submits the form with the pressed button as its submitter (so the form sends "checkout"); goes to checkout when the button cannot submit. */
export function submitForm({ win, target, rootUrl, tools }) {
  try {
    target.form.requestSubmit(target)
  } catch {
    tools.redirectToCheckout({ win, rootUrl, tools })
  }
}

/** The stopped press goes ahead: to the checkout address after an add, else as the control would have done. */
export function sendToCheckout({ win, target, didAdd, rootUrl, tools }) {
  const kind = tools.readResumeKind({ target, didAdd, tools })
  const resume = { checkout: tools.redirectToCheckout, form: tools.submitForm, link: tools.openLink }[kind]
  resume({ win, target, rootUrl, tools })
}

/** Closing the pop-up without going on: the page is reloaded only when something was added, so the cart on the page shows it. */
export function closePopup({ win, didAdd }) {
  if (didAdd) win.location.reload()
}

export const RESUME_TOOLS = { readTargetKind, readResumeKind, redirectToCheckout, openLink, submitForm, sendToCheckout, closePopup }
