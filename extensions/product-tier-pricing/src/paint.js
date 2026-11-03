// Paints the view model onto the widget's own markup (tag, promo, status, rail, chips) and the theme's own price. Copies fields, calculates nothing.
import { computeTierButtonsSignature } from './progress.js'
import { setQuantityInput, setText } from './dom.js'
import { CHIP_SCROLL_TOOLS, scrollActiveChipIntoView } from './chipScroll.js'
import { paintThemePrice, THEME_PRICE_TOOLS } from './themePrice.js'

// The tag in the summary row: the tier pill, the High Demand tag, or nothing.
export function paintTag(elements, viewModel) {
  const el = elements.tagEl
  if (!el) return
  const tag = viewModel.tag
  el.hidden = !tag
  if (!tag) return
  if (el.dataset.kind !== tag.kind) el.dataset.kind = tag.kind
  setText(el, tag.text)
}

// The promo line stays in every state; the status row below carries what changes.
export function paintPromo(elements, viewModel) {
  if (!elements.promoEl) return
  setText(elements.promoEl, viewModel.promoLine)
}

export function paintCard(elements, viewModel) {
  if (elements.cardEl) elements.cardEl.hidden = !viewModel.showCard
}

// Status row: "You have <b>5 units</b>" on the left (the quantity in bold),
// the hint on the right in the colour of the state. Rebuilt only when the
// text changed: live regions re-announce on every write.
export function paintStatus(elements, viewModel) {
  const status = viewModel.status
  if (!status) return
  if (elements.statusEl && elements.statusEl.dataset.text !== status.statusText) {
    elements.statusEl.dataset.text = status.statusText
    elements.statusEl.textContent = ''
    const strong = document.createElement('strong')
    strong.textContent = status.statusParts.strong
    elements.statusEl.append(status.statusParts.before, strong, status.statusParts.after)
  }
  if (elements.asideEl) {
    setText(elements.asideEl, status.hintText || '')
    if (elements.asideEl.dataset.tone !== status.hintTone) elements.asideEl.dataset.tone = status.hintTone
  }
}

// Rail: fill up to the dot, a pin per tier quantity, and the dot showing the
// current quantity. A pin the dot sits on is hidden under it. Positions go
// through --smooth-discounts-pct so the stylesheet keeps the end pins inside the rail.
export function paintProgressBar(elements, dot, semantics, offerState) {
  elements.fillEl.style.width = dot.dotPct + '%'
  elements.markersEl.innerHTML = ''
  dot.markers.forEach((marker) => {
    const el = document.createElement('span')
    el.className = 'smooth-discounts__marker' +
      (marker.reached ? ' smooth-discounts__marker--reached' : '') +
      (marker.covered ? ' smooth-discounts__marker--covered' : '')
    el.style.setProperty('--smooth-discounts-pct', marker.pct + '%')
    el.textContent = String(marker.value)
    elements.markersEl.appendChild(el)
  })
  elements.dotEl.style.setProperty('--smooth-discounts-pct', dot.dotPct + '%')
  elements.dotEl.textContent = String(dot.dotValue)
  if (elements.railEl && offerState) elements.railEl.dataset.offerState = offerState
  if (elements.barEl) {
    if (semantics) {
      elements.barEl.setAttribute('aria-valuenow', String(semantics.valueNow))
      elements.barEl.setAttribute('aria-valuemin', String(semantics.valueMin))
      elements.barEl.setAttribute('aria-valuemax', String(semantics.valueMax))
      elements.barEl.setAttribute('aria-valuetext', semantics.valueText)
    }
  }
}

// One chip per tier ("8 × £13.00", the applied tier ticked); a dashed chip
// between two tiers shows the total for the quantity that sits between them.
// Only the tier chips are buttons: they set the quantity on the page. The row scrolls to keep the active chip in view.
export function paintChips(elements, viewModel) {
  const combinedQty = viewModel.progressState.combinedQty
  elements.tiersEl.innerHTML = ''
  viewModel.chips.forEach((chip) => {
    const isTier = chip.kind === 'tier'
    const el = document.createElement(isTier ? 'button' : 'span')
    el.className = 'smooth-discounts__chip smooth-discounts__chip--' + (isTier ? '' : 'current-') + chip.tone
    el.textContent = chip.label
    if (isTier) {
      el.type = 'button'
      el.setAttribute('aria-pressed', chip.qty === combinedQty ? 'true' : 'false')
      el.addEventListener('click', () => setQuantityInput(chip.qty))
    }
    elements.tiersEl.appendChild(el)
  })
  scrollActiveChipIntoView({ tiersEl: elements.tiersEl, tools: CHIP_SCROLL_TOOLS })
}

// Skips the destructive rebuild (replays animation, clears focus) when
// nothing chip-related changed since last render — tracked via a
// signature on tierButtonsSignatureRef, a { value } box the caller owns.
export function paintProgressCard(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef) {
  if (!viewModel.showCard || !viewModel.progressState) return
  const state = viewModel.progressState

  paintProgressBar(elements, viewModel.dot, viewModel.semantics, viewModel.offerState)
  if (elements.tiersEl) elements.tiersEl.hidden = !viewModel.showChips
  if (!viewModel.showChips) return

  const signature = computeTierButtonsSignature(state, basePrice, addingQty)
  if (tierButtonsSignatureRef.value === signature) return
  tierButtonsSignatureRef.value = signature
  paintChips(elements, viewModel)
}

export function paintWidget(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef) {
  paintTag(elements, viewModel)
  paintThemePrice({ elements, viewModel, tools: THEME_PRICE_TOOLS })
  paintPromo(elements, viewModel)
  paintCard(elements, viewModel)
  paintProgressCard(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef)
  paintStatus(elements, viewModel)
}
