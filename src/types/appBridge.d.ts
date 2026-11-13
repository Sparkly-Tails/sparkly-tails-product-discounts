// What the pages use of Shopify App Bridge (loaded in the root layout): the <ui-save-bar> element, the <s-app-nav> menu with its <s-link> items, and the
// `shopify.saveBar` calls that show and hide it by id, and `shopify.idToken()`, the session token the app's own
// requests carry, and `shopify.app.extensions()`, which reports whether the app's theme blocks are on the live theme.
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ui-save-bar': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>
      's-app-nav': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>
      's-link': DetailedHTMLProps<HTMLAttributes<HTMLElement> & { href?: string; rel?: string }, HTMLElement>
    }
  }
}

declare global {
  interface Window {
    shopify?: {
      saveBar?: { show(id: string): unknown; hide(id: string): unknown }
      idToken?: () => Promise<string>
      app?: { extensions?: () => Promise<{ handle: string; type: string; activations: { handle?: string; status?: string; target?: string }[] }[]> }
    }
  }
}
