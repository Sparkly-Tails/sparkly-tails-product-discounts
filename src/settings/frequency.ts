// How often the checkout pop-up shows the bundle, for the whole store.

export type PopupFrequency = 'session' | 'checkout'

/** Once per shopping session. */
export const DEFAULT_FREQUENCY: PopupFrequency = 'session'

export function readFrequency({ value }: { value: unknown }): PopupFrequency {
  return value === 'checkout' ? 'checkout' : DEFAULT_FREQUENCY
}
