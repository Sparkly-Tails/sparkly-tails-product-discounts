// What the pages use of Shopify App Bridge (loaded in the root layout): the <ui-save-bar> element, and the
// `shopify.saveBar` calls that show and hide it by id.
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ui-save-bar': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

declare global {
  interface Window {
    shopify?: { saveBar?: { show(id: string): unknown; hide(id: string): unknown } }
  }
}
