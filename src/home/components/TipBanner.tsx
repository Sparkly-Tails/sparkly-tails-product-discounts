import { LightbulbIcon } from '@/home/components/icons'

// The tip at the bottom of the page. The link has no destination yet.
export default function TipBanner() {
  return (
    <div className="rounded-xl border border-home-outline-variant/60 bg-home-surface-container-low p-4 flex items-start gap-3">
      <LightbulbIcon className="text-home-secondary text-xl h-7 mt-0.5" />
      <div className="text-xs text-home-on-surface-variant leading-relaxed">
        <strong className="font-semibold text-home-on-surface">Did you know?</strong> Tier-based quantity discounts automatically reflect on your product pages without touching your theme liquid files. For customized badge styles, visit{' '}
        <a className="text-home-primary font-medium hover:underline" href="#">Settings &gt; Visual badges</a>.
      </div>
    </div>
  )
}
