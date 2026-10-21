import CreateCards from '@/home/components/CreateCards'
import DiscountsTable from '@/home/components/DiscountsTable'
import HomeFooter from '@/home/components/HomeFooter'
import HomeHeader from '@/home/components/HomeHeader'
import StatCards from '@/home/components/StatCards'
import TipBanner from '@/home/components/TipBanner'
import { homeFont } from '@/home/homeFont'
import type { TableQuery, TableView } from '@/home/tableQuery'

// The whole homepage of the design, in its own light palette whatever the
// browser prefers: header, title, number cards, create cards, the table, the
// tip and the footer.
export default function HomeView({ view, query, version }: { view: TableView; query: TableQuery; version: string }) {
  return (
    <div className={homeFont.variable + ' font-home bg-home-surface text-home-on-surface min-h-screen antialiased flex flex-col'}>
      <HomeHeader />
      <main className="w-full max-w-[1024px] mx-auto px-6 py-8 flex-1 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-home-on-surface-variant mb-1">
              <span>/</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-home-on-surface">Discounts</h1>
            </div>
          </div>
          <div className="flex items-center gap-2"></div>
        </div>
        <StatCards />
        <CreateCards />
        <DiscountsTable view={view} query={query} />
        <TipBanner />
      </main>
      <HomeFooter version={version} />
    </div>
  )
}
