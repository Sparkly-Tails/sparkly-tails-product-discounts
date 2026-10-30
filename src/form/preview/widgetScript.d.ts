// The storefront widget's script is plain CommonJS (no types). The preview
// imports it, and widgetFunctions.ts gives its functions their types.
declare module '*/tier-pricing.js' {
  const widgetScript: Record<string, unknown>
  export default widgetScript
}
