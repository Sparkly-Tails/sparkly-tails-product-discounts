import type { TiersInitial } from '@/form/components/TiersCard'
import type { FormValues } from '@/form/formValues'

/** A new discount: nothing chosen, the flash sale off, the teaser ticked for when it is switched on. */
export const EMPTY_FORM_VALUES: FormValues = {
  name: '',
  members: [],
  pricingMode: 'percent',
  tiers: [],
  flash: { enabled: false, startsAt: '', endsAt: '', showTeaser: true, highDemand: false },
}

export const EMPTY_TIERS: TiersInitial = { mode: 'percent', percentTiers: [], fixedTiers: [] }
