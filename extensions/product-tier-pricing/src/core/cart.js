// The cart: what the customer already has of this discount's products.
import { cartBaselineOtherQty, sumMemberQuantityInCart } from '../tierMath.js'
import { setQuantityInput } from '../dom.js'

export async function fetchCart() {
  const res = await fetch('/cart.js')
  return res.json()
}

export async function fetchGroupCartState(allMembers, selfMember) {
  const cart = await fetchCart()
  const trueCartQty = sumMemberQuantityInCart(cart.items, allMembers)
  return {
    otherQty: cartBaselineOtherQty(trueCartQty),
    selfQty: sumMemberQuantityInCart(cart.items, [selfMember]),
    cartItems: cart.items,
  }
}

// Resets the stepper to 1 once this product's cart qty is observed to
// increase — this theme's native stepper does NOT do this itself
// (confirmed live). Without it, the next render double-counts: the
// just-added units land in the fresh otherQty AND the stale addingQty.
export function resetStepperIfJustAdded(lastKnownSelfQtyRef, selfQtyNow) {
  if (lastKnownSelfQtyRef.value != null && selfQtyNow > lastKnownSelfQtyRef.value) {
    setQuantityInput(1)
  }
  lastKnownSelfQtyRef.value = selfQtyNow
}
