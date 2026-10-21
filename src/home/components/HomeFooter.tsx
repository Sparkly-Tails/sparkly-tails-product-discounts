// The bottom bar of the redesigned homepage: the app name with its version,
// and three links that have no destination yet.
export default function HomeFooter({ version }: { version: string }) {
  return (
    <footer className="w-full border-t border-home-outline-variant/30 py-4 mt-auto">
      <div className="max-w-[1024px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-home-on-surface-variant gap-2">
        <div>Smooth Discounts v{version}</div>
        <div className="flex items-center gap-4">
          <a className="hover:text-home-on-surface transition-colors" href="#">Privacy</a>
          <a className="hover:text-home-on-surface transition-colors" href="#">Support</a>
          <a className="hover:text-home-on-surface transition-colors" href="#">Shopify App Store</a>
        </div>
      </div>
    </footer>
  )
}
