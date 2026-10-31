// The storefront widget's source is plain JavaScript modules (no types). The preview and the tests import it,
// and these declare the parts they use; widgetFunctions.ts gives the widget's functions their types.
declare module '*/widgetFunctions.js' {
  export const computeWidgetViewModel: (options: never) => unknown
  export const withUnitAnchor: (tiers: never) => unknown
  export const formatMoney: (amount: number, format: string) => string
}

declare module '*/loader/registry.js' {
  export function findComponent(options: { root: object; name: string }): unknown
  export function registerComponent(options: { root: object; name: string; api: unknown }): void
  export function loadComponent(options: { root: object; document: Document; name: string; url: string | undefined }): Promise<unknown>
}

declare module '*/loader/components.js' {
  export function listNeededComponents(options: { hasFlash: boolean; hasTimeSale: boolean }): string[]
  export function parseComponentUrls(json: string | undefined): Record<string, string>
  export function isTimeSaleData(json: string | undefined): boolean
  export function loadComponentSet(options: { names: string[]; loadOne: (name: string) => Promise<unknown> }): Promise<Record<string, unknown>>
}
