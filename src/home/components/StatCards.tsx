import { CalendarIcon, InfoIcon } from '@/home/components/icons'

import type { MetricCard } from '@/home/buildMetricCards'

export default function StatCards({ cards }: { cards: MetricCard[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-home-surface-container-lowest border border-home-outline-variant/70 rounded-lg text-xs font-medium text-home-on-surface hover:bg-home-surface-container transition-colors"
        >
          <CalendarIcon className="text-sm h-5 text-home-on-surface-variant" />
          <span>Last 30d</span>
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((stat) => (
          <div
            key={stat.label}
            data-testid="stat-card"
            className="bg-home-surface-container-lowest border border-home-outline-variant/70 rounded-xl p-5 flex flex-col justify-between"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-home-on-surface-variant mb-3">
              <span data-testid="stat-label">{stat.label}</span>
              <InfoIcon title={stat.hint} className="text-[15px] cursor-pointer text-home-outline-variant hover:text-home-on-surface-variant transition-colors" />
            </div>
            <div data-testid="stat-value" className="text-2xl font-bold tracking-tight text-home-on-surface">{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
