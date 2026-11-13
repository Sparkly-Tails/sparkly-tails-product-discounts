// Whether the app's theme blocks are on the live theme, and where in the theme editor to put them there.
// The status comes from `shopify.app.extensions()` in the embedded admin (no scope needed); the links follow
// Shopify's theme app extension deep-linking docs (checked 2026-11-12).

export type BlockStatus = 'active' | 'inactive' | 'unknown'

export interface ThemeBlock {
  handle: string
  status: string
}

/** One extension as `shopify.app.extensions()` returns it; a theme app extension holds its blocks and embeds in `activations`. */
export interface ExtensionInfo {
  handle: string
  type: string
  activations: { handle?: string; status?: string; target?: string }[]
}

// How the status Shopify reports reads: 'active' runs, a block it does not report is unknown, every other status is not running.
const STATUS_NAMES: Record<string, BlockStatus> = { active: 'active', missing: 'unknown' }

/** 'active' on the published theme, 'inactive' for a block that is shipped but not on, 'unknown' when the app does not report the block. */
export function readBlockStatus({ blocks, handle }: { blocks: ThemeBlock[]; handle: string }): BlockStatus {
  const statusByHandle: Record<string, string> = Object.fromEntries(blocks.map((block) => [block.handle, block.status]))
  return STATUS_NAMES[statusByHandle[handle] ?? 'missing'] ?? 'inactive'
}

/** The editor link that adds a block (to the product page's main section) or turns an embed on. */
export function buildEditorLink({ shop, clientId, handle, kind }: { shop: string; clientId: string; handle: string; kind: 'block' | 'embed' }): string {
  const editor = `https://${shop}/admin/themes/current/editor`
  return kind === 'block'
    ? `${editor}?template=product&addAppBlockId=${clientId}/${handle}&target=mainSection`
    : `${editor}?context=apps&activateAppId=${clientId}/${handle}`
}

/** The blocks and embeds of the theme app extensions as plain handle and status pairs; other kinds of extension are skipped. */
export function flattenExtensions({ extensions }: { extensions: ExtensionInfo[] }): ThemeBlock[] {
  return extensions
    .filter((extension) => extension.type === 'theme_app_extension')
    .flatMap((extension) => extension.activations.map((block) => ({ handle: block.handle ?? '', status: block.status ?? '' })))
}

/** Reads the extensions with the function it is given; a failed read throws. */
export async function readThemeBlocks({ readExtensions, tools = { flattenExtensions } }: { readExtensions: () => Promise<ExtensionInfo[]>; tools?: { flattenExtensions: typeof flattenExtensions } }): Promise<ThemeBlock[]> {
  return tools.flattenExtensions({ extensions: await readExtensions() })
}
