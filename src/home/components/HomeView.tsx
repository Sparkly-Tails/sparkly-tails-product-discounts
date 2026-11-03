import CreateCards from '@/home/components/CreateCards'
import DiscountsTable from '@/home/components/DiscountsTable'
import HomeFooter from '@/home/components/HomeFooter'
import LiveStatCards from '@/home/components/LiveStatCards'
import type { RangeButton } from '@/home/components/StatCards'
import TipBanner from '@/home/components/TipBanner'
import type { TableQuery, TableView } from '@/home/tableQuery'

// The whole homepage of the design, in its own light palette whatever the
// browser prefers: header, title, number cards (filled in by the browser after the page has loaded, so the
// page itself does not wait for them), create cards, the table, the tip and the footer.
export default function HomeView({ view, query, version, metricsUrl, range }: { view: TableView; query: TableQuery; version: string; metricsUrl: string; range: RangeButton }) {
  return (
    <div className="font-home bg-home-surface text-home-on-surface min-h-screen antialiased flex flex-col">
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
        <LiveStatCards key={metricsUrl} metricsUrl={metricsUrl} range={range} />
        <CreateCards />
        <DiscountsTable view={view} query={query} />
        <TipBanner />
      </main>
      <HomeFooter version={version} />
    </div>
  )
}
