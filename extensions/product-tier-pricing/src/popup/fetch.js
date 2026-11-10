// Reading the shop's own JSON (/cart.js, /products/{handle}.js). `win` is the page's window.

export function readJsonAnswer(answer) {
  if (!answer.ok) throw new Error('The shop answered ' + answer.status)
  return answer.json()
}

/** The shop's JSON at `path`; rejects when it cannot be fetched or read. */
export function fetchJson({ win, path }) {
  return win.fetch(path, { headers: { Accept: 'application/json' } }).then(readJsonAnswer)
}

export function returnNothing() {
  return null
}
