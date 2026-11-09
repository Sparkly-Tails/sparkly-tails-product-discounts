// The render cycle of one widget.
import { isVariantAvailable } from '../config.js'
import { formatMoney, resolveEligibility } from '../tierMath.js'
import { fetchGroupCartState, resetStepperIfJustAdded } from './cart.js'

export function createMoneyFormatter(moneyFormat) {
  return (amount) => formatMoney(amount, moneyFormat)
}

// The tiers and the money format to show: the widget's own, or, for a customer who sees another currency (its currency
// component is then loaded), the same in that currency. Not usable when that currency cannot be worked out.
export function readShownPrices({ currencyPart, config }) {
  if (!currencyPart) return { isUsable: true, tiers: config.tiers, moneyFormat: config.moneyFormat }
  return currencyPart.showInCurrency({ tiers: config.tiers, rateText: config.rateText, moneySample: config.moneySample })
}

// Builds the render cycle and wires the mix & match toggle (needs the
// same last-fetched-cart state the render cycle owns). Returns `render`;
// every other listener is wired from initTierPricing against it.
//
// `loading` ({ components, loadSiblings }) holds the components the widget needs: `components` resolves
// with { model, paint, flash? } (or null when one could not be loaded, which leaves the plain
// price the block rendered), `loadSiblings` loads the list's component the first time the list is opened.
export function createRenderer(container, config, elements, loading) {
  const tierButtonsSignatureRef = { value: null }
  const lastKnownSelfQtyRef = { value: null }
  const variantStateRef = { value: config.initialVariantId }
  let formatMoneyFn = createMoneyFormatter(config.moneyFormat)
  let lastCartItems = []
  let lastPricing = null
  let siblingsApi = null

  async function render() {
    // A variant without stock has no widget: nothing is painted or fetched until a variant with stock is chosen.
    const isAvailable = isVariantAvailable({ soldOutVariantIds: config.soldOutVariantIds, variantId: variantStateRef.value })
    container.hidden = !isAvailable
    if (!isAvailable) return
    const basePrice = Number(container.dataset.basePrice)
    const quantityInput = document.querySelector('input[name="quantity"]')
    const addingQty = quantityInput ? Number(quantityInput.value) || 1 : 1
    const eligible = resolveEligibility(config.ownVariantIds, variantStateRef.value)
    // The specific on-screen variant, not allMembers[0] — allMembers[0] is
    // just the first of possibly several own-variant members and would
    // misattribute stepper-reset detection once a product has more than
    // one own member variant.
    const selfMemberNow = { productId: config.productId, variantId: variantStateRef.value }

    let otherQty = 0
    if (config.hasTiers) {
      try {
        const cartState = await fetchGroupCartState(config.allMembers, selfMemberNow)
        lastCartItems = cartState.cartItems
        otherQty = cartState.otherQty
        resetStepperIfJustAdded(lastKnownSelfQtyRef, cartState.selfQty)
      } catch {
        otherQty = 0
      }
    }

    const parts = await loading.components
    if (!parts) return

    const shown = readShownPrices({ currencyPart: parts.currency, config })
    container.hidden = !shown.isUsable
    if (!shown.isUsable) return
    formatMoneyFn = createMoneyFormatter(shown.moneyFormat)

    const viewModel = parts.model.computeWidgetViewModel({
      tiers: eligible ? shown.tiers : [],
      basePrice,
      otherQty,
      addingQty,
      isGroup: config.isGroup,
      highDemand: config.highDemand,
      flash: config.flash,
      flashTools: parts.flash ? parts.flash.flashTools : null,
      nowSeconds: Math.floor(Date.now() / 1000),
      formatMoney: formatMoneyFn,
    })
    // A flash sale that has not started (teaser off) or is over has no card: only the plain price.
    if (config.hasTiers) container.classList.toggle('smooth-discounts--card', viewModel.showChrome)
    if (elements.drawerEl) elements.drawerEl.hidden = !config.isGroup || !viewModel.showDrawer
    if (parts.flash) parts.flash.paintFlashBar(elements, viewModel)
    parts.paint.paintWidget(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef)
    lastPricing = viewModel.progressState
      ? { combinedQty: viewModel.progressState.combinedQty, tierState: viewModel.progressState.tierState, formatMoney: formatMoneyFn }
      : null

    paintList()
  }

  function paintList() {
    if (!(config.isGroup && elements.listEl && !elements.listEl.hidden) || !siblingsApi) return
    siblingsApi.paintSiblingsList({
      listEl: elements.listEl,
      chosenEl: elements.chosenEl,
      config,
      cartItems: lastCartItems,
      pricing: lastPricing,
      currentVariantId: variantStateRef.value,
    })
  }

  // The list's component is only fetched the first time the list is opened.
  function openList() {
    loading.loadSiblings().then((api) => {
      siblingsApi = api
      paintList()
    }, () => {})
  }

  // Liquid renders the drawer markup unconditionally; render() shows it only
  // for a group (isGroup is fixed at metafield-sync time) and not during the
  // flash teaser.

  if (elements.toggleEl && elements.listEl && config.isGroup) {
    let open = false
    elements.toggleEl.addEventListener('click', () => {
      open = !open
      elements.listEl.hidden = !open
      if (elements.chosenEl) elements.chosenEl.hidden = !open
      if (elements.drawerEl) elements.drawerEl.dataset.open = open ? 'true' : 'false'
      elements.toggleEl.setAttribute('aria-expanded', open ? 'true' : 'false')
      if (open) openList()
    })
  }

  render.variantStateRef = variantStateRef
  return render
}
