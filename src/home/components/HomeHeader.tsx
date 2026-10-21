// The top bar of the redesigned homepage: the "ST" mark and the app name,
// centred, as in the design.
export default function HomeHeader() {
  return (
    <header className="bg-home-surface border-b border-home-outline-variant w-full sticky top-0 z-30">
      <div className="max-w-[1024px] mx-auto px-6 h-14 relative flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <nav className="hidden md:flex items-center space-x-6"></nav>
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-home-primary-container text-white flex items-center justify-center font-bold text-xs">ST</span>
          <span className="font-bold text-home-primary text-base tracking-tight">Smooth Discounts</span>
        </div>
        <div className="flex items-center gap-2"></div>
      </div>
    </header>
  )
}
