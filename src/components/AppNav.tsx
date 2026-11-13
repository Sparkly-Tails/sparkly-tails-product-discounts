// The app's menu in the Shopify admin. App Bridge draws it from this element: the discounts page is the app's home
// (it is the app's own entry in the left menu, so its link is hidden), and Settings is listed under the app.
// Outside the admin, where there is no App Bridge, the element does nothing.
export default function AppNav() {
  return (
    <s-app-nav>
      <s-link href="/" rel="home">Discounts</s-link>
      <s-link href="/settings">Settings</s-link>
    </s-app-nav>
  )
}
