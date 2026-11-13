'use client'

import { useEffect, useState } from 'react'
import Card from '@/form/components/Card'
import { TouchAppIcon } from '@/form/components/icons'
import { buildEditorLink, readBlockStatus, type BlockStatus, type ThemeBlock } from '@/settings/themeStatus'

const ROWS: { handle: string; kind: 'block' | 'embed'; label: string; help: string }[] = [
  { handle: 'tier-pricing', kind: 'block', label: 'Product page widget', help: 'The tier prices and the flash sale bar on the product page.' },
  { handle: 'card-prices', kind: 'embed', label: 'Card prices', help: 'Shows the tier price on product cards in collections and search.' },
  { handle: 'bundle-popup', kind: 'embed', label: 'Pre-checkout pop-up', help: 'Offers the next tier when a shopper goes from the cart to checkout.' },
]

const STATUS_TEXT: Record<BlockStatus, string> = { active: 'Active', inactive: 'Not active', unknown: 'Not active' }

// The pill of a block's status: green dot for active, grey for the rest.
function StatusPill({ status }: { status: BlockStatus }) {
  const dotClass = status === 'active' ? 'bg-green-600' : 'bg-form-outline'
  return (
    <span className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full bg-form-surface-container-lowest text-form-label-sm text-form-on-surface">
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {STATUS_TEXT[status]}
    </span>
  )
}

// The link that adds a block (or turns an embed on) in the theme editor.
function ThemeLink({ kind, label, link }: { kind: 'block' | 'embed'; label: string; link: string }) {
  const action = kind === 'block' ? 'Add to theme' : 'Turn on'
  return <a href={link} target="_top" aria-label={`${action}: ${label}`} className="text-form-label-md text-form-secondary hover:underline whitespace-nowrap">{action} →</a>
}

// One block: its name and help, its status once it is read, and the link that adds it in the theme editor.
// A block that is already active has no link: there is nothing to add or turn on.
function ThemeRow({ row, status, link }: { row: (typeof ROWS)[number]; status: BlockStatus | null; link: string }) {
  return (
    <li className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-form-surface-container-low">
      <span>
        <span className="block text-form-label-md text-form-on-surface font-medium">{row.label}</span>
        <span className="block text-form-body-sm text-form-on-surface-variant">{row.help}</span>
        {status === null ? null : <StatusPill status={status} />}
      </span>
      {status === 'active' ? null : <ThemeLink kind={row.kind} label={row.label} link={link} />}
    </li>
  )
}

// What the read gave: nothing yet, the blocks, or a failure. A failure leaves the rows without a status.
type Reading = { phase: 'loading' } | { phase: 'failed' } | { phase: 'done'; blocks: ThemeBlock[] }

// The "Shopify Theme Integration" panel: whether each block is on the live theme, with a link to the theme editor
// to add it. It has nothing to save. The read is passed in because only the browser can ask App Bridge.
export default function ThemePanel({ shop, clientId, readBlocks }: { shop: string; clientId: string; readBlocks: () => Promise<ThemeBlock[]> }) {
  const [reading, setReading] = useState<Reading>({ phase: 'loading' })

  useEffect(() => {
    let isCurrent = true
    readBlocks().then(
      (blocks) => { if (isCurrent) setReading({ phase: 'done', blocks }) },
      () => { if (isCurrent) setReading({ phase: 'failed' }) },
    )
    return () => { isCurrent = false }
  }, [readBlocks])

  const blocks = reading.phase === 'done' ? reading.blocks : null
  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <TouchAppIcon className="text-[20px] text-form-secondary" />
        <div>
          <h2 className="text-form-headline-sm text-form-on-surface">Shopify Theme Integration</h2>
          <p className="text-form-body-sm text-form-on-surface-variant">Whether the app&apos;s blocks are on your live theme</p>
        </div>
      </div>
      {reading.phase === 'failed' ? <p role="status" className="text-form-body-md text-form-on-surface-variant">Status could not be read</p> : null}
      <ul className="space-y-3">
        {ROWS.map((row) => (
          <ThemeRow
            key={row.handle}
            row={row}
            status={blocks === null ? null : readBlockStatus({ blocks, handle: row.handle })}
            link={buildEditorLink({ shop, clientId, handle: row.handle, kind: row.kind })}
          />
        ))}
      </ul>
    </Card>
  )
}
