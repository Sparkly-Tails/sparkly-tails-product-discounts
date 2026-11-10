// The mark a card carries, so the page is not scanned twice for it: 'pending' while its offer is worked out, 'on' once painted,
// 'off' when it gets none. Both the card script and its offer component write it, so it lives apart from both.
const MARK = 'smoothDiscountsCard'

export function isMarked({ root }) {
  return root.dataset[MARK] !== undefined
}

export function markCard({ root, state }) {
  root.dataset[MARK] = state
}
