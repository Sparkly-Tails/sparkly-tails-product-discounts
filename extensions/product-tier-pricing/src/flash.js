// The flash sale: phase, countdown, the bar at the top of the card, and painting that bar.
import { setText } from './dom.js'

// Flash sale: the window is two Unix seconds written by the admin. The sale
// runs from its start second up to (not including) its end second.

export function flashPhase({ nowSeconds, startsAtUnix, endsAtUnix }) {
  if (nowSeconds < startsAtUnix) return 'before'
  return nowSeconds < endsAtUnix ? 'running' : 'ended'
}

export function flashPad(value) {
  return value < 10 ? '0' + value : String(value)
}

// ['04', '18', '49'] while an hour or more is left, else ['18', '49']; never negative.
export function flashCountdownParts({ secondsLeft }) {
  const total = Math.max(0, Math.floor(secondsLeft))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0 ? [flashPad(hours), flashPad(minutes), flashPad(seconds)] : [flashPad(minutes), flashPad(seconds)]
}

// "04 : 18 : 49" (hours only while an hour or more is left).
export function formatFlashCountdown({ secondsLeft }) {
  return flashCountdownParts({ secondsLeft }).join(' : ')
}

// The compact timer of the chip: "14:32", or "1:00:05" from an hour up.
export function formatFlashChip({ secondsLeft }) {
  const parts = flashCountdownParts({ secondsLeft })
  if (parts.length === 3) parts[0] = String(Number(parts[0]))
  return parts.join(':')
}

export const FLASH_HIDDEN_BAR = { variant: 'hidden', text: '', label: '', timerParts: [], aside: '', chip: '' }

// The bar at the top of the card. `variant` picks its look (dark with a bolt,
// green banner, dark with a star); `text` is the whole sentence (for screen
// readers), `label` the part before the timer boxes.
//   before the start (teaser on): "Flash sale starts in 02 : 10 : 00"
//   running below the first tier: "Flash sale ends in 04 : 18 : 49"
//   first tier: "Tier 1 unlocked! Flash sale active", "£1.63/ea", the chip
//   a higher tier: "Tier 2 active (£1.55/ea · Keep adding)", the chip
//   before the start without the teaser, and after the end: no bar.
export function buildFlashBar({ phase, showTeaser, reachedTier, unitPriceLabel, countdownText, countdownParts, chipText }) {
  if (phase === 'ended' || (phase === 'before' && !showTeaser)) return FLASH_HIDDEN_BAR
  if (phase === 'before') {
    return { variant: 'teaser', text: 'Flash sale starts in ' + countdownText, label: 'Flash sale starts in', timerParts: countdownParts, aside: '', chip: '' }
  }
  if (reachedTier === 0) {
    return { variant: 'ends', text: 'Flash sale ends in ' + countdownText, label: 'Flash sale ends in', timerParts: countdownParts, aside: '', chip: '' }
  }
  if (reachedTier === 1) {
    const first = 'Tier 1 unlocked! Flash sale active'
    return { variant: 'tier-first', text: first, label: first, timerParts: [], aside: unitPriceLabel + '/ea', chip: chipText }
  }
  const higher = 'Tier ' + reachedTier + ' active (' + unitPriceLabel + '/ea · Keep adding)'
  return { variant: 'tier-higher', text: higher, label: higher, timerParts: [], aside: '', chip: chipText }
}

// The flash bar: the sentence, the timer as one box per part (teaser and
// "ends in" only), the unit price on the right and the timer chip. Text is
// only rewritten when it changed; the timer changes every second.
export function paintFlashBar(elements, viewModel) {
  const el = elements.flashEl
  if (!el) return
  const bar = viewModel.flashBar
  el.hidden = !bar || bar.variant === 'hidden'
  if (el.hidden) return
  if (el.dataset.variant !== bar.variant) el.dataset.variant = bar.variant
  setText(elements.flashLabelEl, bar.label)
  paintFlashTimer(elements.flashTimerEl, bar.timerParts)
  setText(elements.flashAsideEl, bar.aside)
  elements.flashChipEl.hidden = !bar.chip
  setText(elements.flashChipTextEl, bar.chip)
}

export function paintFlashTimer(timerEl, parts) {
  if (!timerEl) return
  if (parts.length === 0) {
    if (timerEl.children.length > 0) timerEl.textContent = ''
    return
  }
  if (timerEl.children.length !== parts.length * 2 - 1) {
    timerEl.textContent = ''
    parts.forEach((part, index) => {
      if (index > 0) {
        const sep = document.createElement('span')
        sep.className = 'sparkly-tier-pricing__flash-sep'
        sep.textContent = ':'
        timerEl.appendChild(sep)
      }
      const digit = document.createElement('span')
      digit.className = 'sparkly-tier-pricing__flash-digit'
      timerEl.appendChild(digit)
    })
  }
  parts.forEach((part, index) => setText(timerEl.children[index * 2], part))
}

// What the view model needs of the flash sale, handed to it as `flashTools`.
export const FLASH_TOOLS = { flashPhase, formatFlashCountdown, flashCountdownParts, formatFlashChip, buildFlashBar }
