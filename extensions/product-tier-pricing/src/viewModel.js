// Decides WHAT the widget shows (the view model). The painting only paints whatever this returns.
import { clamp, perUnitPrice, sortTiersByMinQty } from './tierMath.js'
import { buildProgressSemantics, classifyOfferState, computeProgressDot, computeProgressState, pluralizeUnits } from './progress.js'
import { buildPriceTag, buildPromoLine, buildStatusCopy, buildTierChips, tierNumberOf } from './copy.js'

// `flashTools` carries the flash sale functions (phase, countdown, bar): they live in the flash component,
// which a page without a flash sale never loads. Without a `flash` they are not used.

export function computeWidgetViewModel({ tiers, basePrice, otherQty, addingQty, isGroup, highDemand, flash, flashTools, nowSeconds, formatMoney: formatMoneyFn }) {
  const plainPrice = formatMoneyFn(basePrice)
  const hasTiers = !!(tiers && tiers.length > 0)
  const phase = flash && hasTiers ? flashTools.flashPhase({ nowSeconds, startsAtUnix: flash.startsAtUnix, endsAtUnix: flash.endsAtUnix }) : null
  const secondsLeft = phase === 'before' ? flash.startsAtUnix - nowSeconds : phase ? flash.endsAtUnix - nowSeconds : 0

  // The teaser (before the start, switched on): the bar, the plain price and
  // the progress bar with its pins and the quantity. Everything that carries a
  // tier price (the chips, the hints, the promo line, the tag, the drawer) stays
  // away until the sale starts.
  if (phase === 'before' && flash.showTeaser) {
    const progressState = computeProgressState(tiers, otherQty || 0, addingQty)
    const quantity = progressState.combinedQty
    const hint = 'Tier prices start with the sale'
    return {
      showCard: true,
      showChips: false,
      showDrawer: false,
      showChrome: true,
      flashBar: flashTools.buildFlashBar({
        phase, showTeaser: true, reachedTier: 0, unitPriceLabel: '',
        countdownText: flashTools.formatFlashCountdown({ secondsLeft }), countdownParts: flashTools.flashCountdownParts({ secondsLeft }), chipText: flashTools.formatFlashChip({ secondsLeft }),
      }),
      discountedPrice: null,
      plainPrice,
      // "Get it from: £1.63": the unit price the tiers give the quantity selected now (page plus cart), the same
      // price the running sale shows. Below the first tier it is the plain price.
      progressState,
      chips: [],
      tag: null,
      offerState: 'progress',
      dot: computeProgressDot(sortTiersByMinQty(tiers), quantity),
      promoLine: 'Get it from: ' + formatMoneyFn(perUnitPrice(basePrice, quantity, progressState.tierState)),
      status: {
        state: 'progress',
        statusText: 'You have ' + pluralizeUnits(quantity),
        statusParts: { before: 'You have ', strong: pluralizeUnits(quantity), after: '' },
        hintText: hint,
        hintTone: 'accent',
      },
      semantics: { valueNow: clamp(quantity, progressState.startThreshold, progressState.topThreshold), valueMin: progressState.startThreshold, valueMax: progressState.topThreshold, valueText: (quantity > progressState.topThreshold ? pluralizeUnits(quantity) : quantity + ' of ' + progressState.topThreshold + ' units') + '. ' + hint + '.' },
    }
  }

  // No discount for this variant, or a flash sale that is not running (before
  // its start without a teaser, or over): the plain price only.
  if (!hasTiers || (phase && phase !== 'running')) {
    return {
      showCard: false,
      showChips: false,
      showDrawer: false,
      showChrome: !phase,
      flashBar: phase ? flashTools.buildFlashBar({
        phase, showTeaser: !!flash.showTeaser, reachedTier: 0, unitPriceLabel: '',
        countdownText: flashTools.formatFlashCountdown({ secondsLeft }), countdownParts: flashTools.flashCountdownParts({ secondsLeft }), chipText: flashTools.formatFlashChip({ secondsLeft }),
      }) : null,
      discountedPrice: null,
      plainPrice,
      progressState: null,
      chips: [],
      tag: null,
      offerState: null,
      dot: null,
      promoLine: '',
      status: null,
      semantics: null,
    }
  }

  const progressState = computeProgressState(tiers, otherQty || 0, addingQty)
  // perUnitPrice, not unitPriceAtTier: this needs the price at the current
  // COMBINED quantity, not at a specific tier's own minQty.
  const unit = perUnitPrice(basePrice, progressState.combinedQty, progressState.tierState)
  const isDiscounted = progressState.tierState.fixedPrice != null || progressState.tierState.percentOff > 0

  const sortedTiers = sortTiersByMinQty(tiers)

  const offerState = classifyOfferState(progressState)
  const flashBar = !flash ? null : flashTools.buildFlashBar({
    phase: 'running',
    showTeaser: !!flash.showTeaser,
    reachedTier: offerState === 'progress' ? 0 : tierNumberOf(tiers, progressState.tierState.minQty),
    unitPriceLabel: formatMoneyFn(unit),
    countdownText: flashTools.formatFlashCountdown({ secondsLeft }),
    countdownParts: flashTools.flashCountdownParts({ secondsLeft }),
    chipText: flashTools.formatFlashChip({ secondsLeft }),
  })

  return {
    showCard: true,
    showChips: true,
    showDrawer: true,
    showChrome: true,
    flashBar,
    discountedPrice: isDiscounted ? formatMoneyFn(unit) : null,
    plainPrice,
    progressState,
    chips: buildTierChips({ tiers, basePrice, combinedQty: progressState.combinedQty, formatMoney: formatMoneyFn }),
    tag: buildPriceTag({ progressState, highDemand: !!highDemand }),
    offerState,
    dot: computeProgressDot(sortedTiers, progressState.combinedQty),
    promoLine: buildPromoLine(tiers, basePrice, formatMoneyFn, isGroup),
    status: buildStatusCopy({ progressState, tiers, basePrice, formatMoney: formatMoneyFn }),
    semantics: buildProgressSemantics(progressState),
  }
}

// A computeWidgetViewModel that already has the flash functions, for callers (the admin preview, the tests)
// that hold the flash module themselves.
export function bindFlashTools({ computeModel, flashTools }) {
  return (options) => computeModel({ ...options, flashTools })
}
