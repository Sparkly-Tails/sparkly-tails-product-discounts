// The block statuses from Shopify App Bridge, which only the browser can ask. This is the one place that reads it.
import { readThemeBlocks, type ExtensionInfo, type ThemeBlock } from '@/settings/themeStatus'

/* eslint-disable guidelines/no-outer-scope-reads -- App Bridge is a browser global, read only here */
/** Asks App Bridge for the app's extensions; throws when App Bridge is not there, which the panel reports as "could not be read". */
export function readWindowExtensions(): Promise<ExtensionInfo[]> {
  return window.shopify!.app!.extensions!()
}
/* eslint-enable guidelines/no-outer-scope-reads */

const APP_BRIDGE_TOOLS = { readThemeBlocks, readWindowExtensions }

export function readAppBridgeBlocks({ tools = APP_BRIDGE_TOOLS }: { tools?: typeof APP_BRIDGE_TOOLS } = {}): Promise<ThemeBlock[]> {
  return tools.readThemeBlocks({ readExtensions: tools.readWindowExtensions })
}
