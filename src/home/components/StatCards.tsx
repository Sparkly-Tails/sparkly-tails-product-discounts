import DateRangePicker from '@/home/components/DateRangePicker'
import { InfoIcon } from '@/home/components/icons'
import type { RangePreset } from '@/home/rangeDays'

import type { MetricCard } from '@/home/buildMetricCards'

export interface RangeButton {
  label: string
  today: string
  presets: RangePreset[]
  keep: string
}

export default function StatCards({ cards, range }: { cards: MetricCard[]; range: RangeButton }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <DateRangePicker label={range.label} today={range.today} presets={range.presets} keep={range.keep} />
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
