// The one Save of the Settings page. Shopify is written first and the store's settings after, so a refusal from
// Shopify leaves everything as it was (the order of the discount save: record before config).
import type { StoreSettings } from '@/settings/storeSettings'

export interface SettingsSaveResult {
  ok: boolean
  message: string
}

export interface SettingsSaveSteps {
  writeShopify: (settings: StoreSettings) => Promise<void>
  writeSettings: (settings: StoreSettings) => Promise<void>
  /** Removes the per-discount values the settings replaced; safe to run again (see cleanOldValues). */
  cleanOldValues: () => Promise<void>
}

/** Why a step failed, in words: the error's own message, or the fallback when it has none. */
export function describeFailure({ error, fallback }: { error: unknown; fallback: string }): string {
  return error instanceof Error ? error.message : fallback
}

/** The clean-up after the settings are saved: its failure is reported as "saved, but unfinished", never as a failed save. */
export async function runCleanUp({ steps, tools = CLEAN_UP_TOOLS }: { steps: SettingsSaveSteps; tools?: { describeFailure: typeof describeFailure } }): Promise<SettingsSaveResult> {
  try {
    await steps.cleanOldValues()
    return { ok: true, message: 'Settings saved.' }
  } catch (error) {
    const reason = tools.describeFailure({ error, fallback: 'an unknown error' })
    return { ok: false, message: `The settings are saved, but removing the old per-discount values did not finish (${reason}). Save again to finish it.` }
  }
}

const CLEAN_UP_TOOLS = { describeFailure }
const SAVE_TOOLS = { describeFailure, runCleanUp }

export async function runSettingsSave({ settings, steps, tools = SAVE_TOOLS }: { settings: StoreSettings; steps: SettingsSaveSteps; tools?: { describeFailure: typeof describeFailure; runCleanUp: typeof runCleanUp } }): Promise<SettingsSaveResult> {
  try {
    await steps.writeShopify(settings)
    await steps.writeSettings(settings)
  } catch (error) {
    return { ok: false, message: tools.describeFailure({ error, fallback: 'The settings could not be saved.' }) }
  }
  return tools.runCleanUp({ steps })
}
