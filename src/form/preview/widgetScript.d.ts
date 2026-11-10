// The storefront widget's source is plain JavaScript modules (no types). The preview and the tests import it,
// and these declare the parts they use; widgetFunctions.ts gives the widget's functions their types.
declare module '*/widgetFunctions.js' {
  export const computeWidgetViewModel: (options: never) => unknown
  export const withUnitAnchor: (tiers: never) => unknown
  export const formatMoney: (amount: number, format: string) => string
}

declare module '*/config.js' {
  export function parseSoldOutVariantIds(raw: string | undefined): string[] | null
  export function isVariantAvailable(options: { soldOutVariantIds: string[] | null; variantId: string | number | null }): boolean
}

declare module '*/core/wiring.js' {
  export function readSelectedVariantId(options: { root: Document; tools: { extractNumericId: (id: string) => string } }): string | null
}

declare module '*/loader/registry.js' {
  export function findComponent(options: { root: object; name: string }): unknown
  export function registerComponent(options: { root: object; name: string; api: unknown }): void
  export function loadComponent(options: { root: object; document: Document; name: string; url: string | undefined }): Promise<unknown>
}

declare module '*/loader/components.js' {
  export function listNeededComponents(options: { hasFlash: boolean }): string[]
  export function parseComponentUrls(json: string | undefined): Record<string, string>
  export function loadComponentSet(options: { names: string[]; loadOne: (name: string) => Promise<unknown> }): Promise<Record<string, unknown>>
}

declare module '*/chipScroll.js' {
  export const CHIP_SCROLL_TOOLS: unknown
  export function computeScrollLeft(input: { chipLeft: number; chipWidth: number; viewLeft: number; viewWidth: number }): number
  export function scrollActiveChipIntoView(input: { tiersEl: HTMLElement; tools: unknown }): void
}

// The bundle pop-up's modules. The tests pass plain objects, so the inputs are left open here.
type PopupCall = (...input: any[]) => any // eslint-disable-line @typescript-eslint/no-explicit-any

declare module '*/popup/units.js' {
  export const countBundleUnits: PopupCall
  export const UNIT_TOOLS: unknown
}

declare module '*/popup/session.js' {
  export const buildShownKey: PopupCall
  export const isShown: PopupCall
  export const recordShown: PopupCall
}

declare module '*/popup/due.js' {
  export const readFirstTierQty: PopupCall
  export const isBundleIncomplete: PopupCall
  export const listDueBundles: PopupCall
  export const DUE_TOOLS: unknown
}

declare module '*/popup/items.js' {
  export const listEligibleItems: PopupCall
  export const isCompletable: PopupCall
  export const chooseQuickFill: PopupCall
  export const sumQuickFillCost: PopupCall
  export const readSharedPrice: PopupCall
  export const LIST_TOOLS: Record<string, unknown>
  export const FILL_TOOLS: Record<string, unknown>
}

declare module '*/popup/copy.js' {
  export const buildHeadingText: PopupCall
  export const buildBoxTitle: PopupCall
  export const buildBadgeText: PopupCall
  export const buildIncentiveText: PopupCall
  export const buildQuickLabelText: PopupCall
  export const buildQuickButtonText: PopupCall
  export const buildQuickAddText: PopupCall
  export const buildViewText: PopupCall
  export const buildCostText: PopupCall
  export const buildChips: PopupCall
  export const readTierMode: PopupCall
  export const COPY_TOOLS: unknown
}

declare module '*/popup/look.js' {
  export const readBoxLook: PopupCall
  export const applyBoxLook: PopupCall
  export const LOOK_TOOLS: unknown
}
