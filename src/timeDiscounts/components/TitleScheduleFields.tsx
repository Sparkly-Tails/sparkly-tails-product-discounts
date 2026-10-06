'use client'

const inputClass =
  'w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent'

/** The title and schedule inputs of a create form. The form owns the values; this only shows them. */
export default function TitleScheduleFields({
  title, startsAt, endsAt, problem, shopTimezone, onTitleChange, onStartsAtChange, onEndsAtChange,
}: {
  title: string
  startsAt: string
  endsAt: string
  /** Why the schedule cannot be saved, or null. */
  problem: string | null
  shopTimezone: string
  onTitleChange: (value: string) => void
  onStartsAtChange: (value: string) => void
  onEndsAtChange: (value: string) => void
}) {
  return (
    <>
      <section className="mb-8">
        <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
        <input
          id="title" name="title" type="text" placeholder="e.g. Spring Flash Sale"
          value={title} onChange={(e) => onTitleChange(e.target.value)}
          className={inputClass}
        />
        <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Schedule</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
            <input id="startsAt" name="startsAt" type="datetime-local" value={startsAt} onChange={(e) => onStartsAtChange(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
            <input id="endsAt" name="endsAt" type="datetime-local" value={endsAt} onChange={(e) => onEndsAtChange(e.target.value)} className={inputClass} />
          </div>
        </div>
        {problem && <p role="alert" className="text-xs text-danger mt-2">{problem}</p>}
      </section>
    </>
  )
}
