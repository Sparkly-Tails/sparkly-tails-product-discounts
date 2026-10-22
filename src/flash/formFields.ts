// What the tier discount form sends for a flash sale and the High Demand tag.
// An unchecked checkbox sends nothing, so a missing field means "off".
import type { FlashSale } from '@/lib/config'

/** The flash sale of the form, or null when the Flash sale switch is off. A time left empty stays empty so the caller can ask for it. */
export function parseFlashFromForm({ formData }: { formData: FormData }): FlashSale | null {
  if (formData.get('flashEnabled') !== 'on') return null
  return {
    startsAt: formData.getAll('flashStartsAt').join('').trim(),
    endsAt: formData.getAll('flashEndsAt').join('').trim(),
    showTeaser: formData.get('flashShowTeaser') === 'on',
  }
}

export function parseHighDemandFromForm({ formData }: { formData: FormData }): boolean {
  return formData.get('highDemand') === 'on'
}
