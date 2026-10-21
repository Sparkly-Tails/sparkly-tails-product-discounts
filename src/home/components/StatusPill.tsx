// The Active / Inactive pill of a table row, as in the design.
const PILL_STYLES = {
  true: { label: 'Active', pill: 'bg-home-tertiary-fixed text-home-on-tertiary-fixed border border-home-tertiary-fixed-dim/60', dot: 'bg-[#5a7d3b]' },
  false: { label: 'Inactive', pill: 'bg-home-surface-container-highest text-home-on-surface-variant border border-home-outline-variant', dot: 'bg-home-outline' },
}

export default function StatusPill({ isActive }: { isActive: boolean }) {
  const style = PILL_STYLES[String(isActive) as 'true' | 'false']
  return (
    <span className={'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] leading-4 font-semibold ' + style.pill}>
      <span className={'w-1.5 h-1.5 rounded-full ' + style.dot}></span>
      {style.label}
    </span>
  )
}
