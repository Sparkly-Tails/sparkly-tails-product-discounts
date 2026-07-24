function computeTierState(tiers, quantity) {
  const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
  const reached = sorted.filter((t) => t.minQty <= quantity)
  const notReached = sorted.filter((t) => t.minQty > quantity)

  if (reached.length === 0) {
    return {
      percentOff: 0,
      nextTier: null,
      remainingTiers: notReached.map((t) => ({
        minQty: t.minQty,
        percentOff: t.percentOff,
        delta: t.minQty - quantity,
      })),
    }
  }

  const percentOff = reached[reached.length - 1].percentOff

  if (notReached.length === 0) {
    return { percentOff, nextTier: null, remainingTiers: null }
  }

  const next = notReached[0]
  return {
    percentOff,
    nextTier: { minQty: next.minQty, percentOff: next.percentOff, delta: next.minQty - quantity },
    remainingTiers: null,
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeTierState }
}
