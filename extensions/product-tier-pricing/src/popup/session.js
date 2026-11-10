// What the pop-up remembers about this tab's session: which bundles it has already shown. All of it is best effort: with
// storage blocked it remembers nothing and the pop-up shows every time. `storage` is the page's sessionStorage.
const KEY_PREFIX = 'smoothDiscountsPopup:'

/** The storage key of a discount: its id, or (an index saved before ids were added) the first member's product id. */
export function buildShownKey({ discount }) {
  return KEY_PREFIX + (discount.discountId || 'p' + discount.members[0].productId)
}

/** True when the key was recorded in this session; false when it was not or the storage cannot be read. */
export function isShown({ storage, key }) {
  try {
    return storage.getItem(key) !== null
  } catch {
    return false
  }
}

export function recordShown({ storage, key }) {
  try {
    storage.setItem(key, '1')
  } catch {
    // Storage is blocked: nothing is remembered and the pop-up shows again.
  }
}
