'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '@/home/components/icons'
import { addDays, buildMonthGrid, formatMonthTitle, pickMonthStart, type RangePreset } from '@/home/rangeDays'

const BUTTON_CLASS =
  'inline-flex items-center gap-1.5 px-3 py-1.5 bg-home-surface-container-lowest border border-home-outline-variant/70 rounded-lg text-xs font-medium text-home-on-surface hover:bg-home-surface-container transition-colors'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// The address of the page with the given range parameters, after the table settings it keeps.
function buildRangeHref({ keep, params }: { keep: string; params: string }): string {
  return '/?' + [keep, params].filter((part) => part !== '').join('&')
}

// The days chosen after a click: a second click completes the pair, any other click starts a new one.
function pickNextDays({ picks, day }: { picks: string[]; day: string }): string[] {
  return picks.length === 1 ? [picks[0], day] : [day]
}

type RangePosition = 'edge' | 'inside' | 'outside'

// The days the calendar marks: the ones being chosen while a choice is on, else the range the cards are for.
function pickMarkedDays({ picks, fromDay, toDay }: { picks: string[]; fromDay: string; toDay: string }): { fromDay: string; toDay: string } {
  const sorted = [...picks].sort()
  return picks.length === 0 ? { fromDay, toDay } : { fromDay: sorted[0], toDay: sorted[sorted.length - 1] }
}

// Whether a day is the first or last of the marked days, between them, or neither (day texts sort like dates).
function classifyDay({ day, fromDay, toDay }: { day: string; fromDay: string; toDay: string }): RangePosition {
  const isEdge = [fromDay, toDay].includes(day)
  const isBetween = [fromDay, day, toDay].sort()[1] === day
  return isEdge ? 'edge' : isBetween ? 'inside' : 'outside'
}

const DAY_CLASSES: Record<RangePosition, string> = {
  edge: 'bg-home-primary text-white',
  inside: 'bg-home-primary/15 text-home-on-surface',
  outside: 'text-home-on-surface hover:bg-home-surface-container',
}

function MonthHeader({ monthStart, today, onMove }: { monthStart: string; today: string; onMove: (monthStart: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <button type="button" aria-label="Previous month" onClick={() => onMove(pickMonthStart({ day: addDays({ day: monthStart, count: -1 }) }))} className="p-1 rounded-lg hover:bg-home-surface-container">
        <ChevronLeftIcon className="text-sm h-5" />
      </button>
      <span className="text-xs font-semibold text-home-on-surface">{formatMonthTitle({ monthStart })}</span>
      <button
        type="button"
        aria-label="Next month"
        disabled={monthStart >= pickMonthStart({ day: today })}
        onClick={() => onMove(pickMonthStart({ day: addDays({ day: monthStart, count: 31 }) }))}
        className="p-1 rounded-lg hover:bg-home-surface-container disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRightIcon className="text-sm h-5" />
      </button>
    </div>
  )
}

function DayCell({ day, today, position, onPick }: { day: string | null; today: string; position: RangePosition; onPick: (day: string) => void }) {
  if (day === null) return <span />
  return (
    <button
      type="button"
      data-day={day}
      data-range-position={position}
      aria-pressed={position !== 'outside'}
      disabled={day > today}
      onClick={() => onPick(day)}
      className={'h-7 rounded-lg text-xs disabled:opacity-30 ' + DAY_CLASSES[position]}
    >
      {Number(day.slice(8, 10))}
    </button>
  )
}

function MonthGrid({ monthStart, today, marked, onPick }: { monthStart: string; today: string; marked: { fromDay: string; toDay: string }; onPick: (day: string) => void }) {
  return (
    <div className="grid grid-cols-7 gap-y-1 text-center text-[11px]">
      {WEEKDAYS.map((weekday) => (
        <span key={weekday} className="text-home-on-surface-variant">{weekday}</span>
      ))}
      {buildMonthGrid({ monthStart }).map((day, index) => (
        <DayCell key={day ?? `empty-${index}`} day={day} today={today} position={day === null ? 'outside' : classifyDay({ day, ...marked })} onPick={onPick} />
      ))}
    </div>
  )
}

function ApplyLink({ picks, keep, onClose }: { picks: string[]; keep: string; onClose: () => void }) {
  const [firstDay, lastDay] = [...picks].sort()
  if (picks.length !== 2) return null
  return (
    <Link href={buildRangeHref({ keep, params: `from=${firstDay}&to=${lastDay}` })} onClick={onClose} className="text-center text-xs font-medium text-white bg-home-primary rounded-lg py-1.5">
      Apply
    </Link>
  )
}

function PresetLinks({ presets, keep, onClose }: { presets: RangePreset[]; keep: string; onClose: () => void }) {
  return (
    <div className="border-t border-home-outline-variant/70 pt-2 flex flex-col">
      {presets.map((preset) => (
        <Link
          key={preset.key}
          href={buildRangeHref({ keep, params: `range=${preset.key}` })}
          onClick={onClose}
          className="px-2 py-1.5 text-xs text-home-on-surface-variant hover:bg-home-surface-container rounded-lg transition-colors"
        >
          {preset.label}
        </Link>
      ))}
    </div>
  )
}

// Closes the panel with Escape or a mouse press outside the element of `rootRef`, while it is open.
// A browser event listener has to read the panel's state and the page's document, which React gives no other way to reach.
/* eslint-disable guidelines/no-outer-scope-reads, guidelines/no-outer-scope-calls -- listeners of an effect close over the hook's parameters */
function useCloseOnOutside({ isOpen, rootRef, onClose }: { isOpen: boolean; rootRef: { current: HTMLDivElement | null }; onClose: () => void }) {
  useEffect(() => {
    if (!isOpen) return undefined
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    function handleMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [isOpen, rootRef, onClose])
}

/* eslint-enable guidelines/no-outer-scope-reads, guidelines/no-outer-scope-calls */

// The "Last 30 days" button of the number cards: it opens a month calendar and the list of ready-made ranges.
// A preset is a link; two chosen days and Apply make the custom link. It closes with Escape, a click outside, or a choice.
// The calendar marks the range the cards are for (`fromDay` to `toDay`), opens on the month of its last day, and goes back to
// both every time it is opened.
export default function DateRangePicker({ label, today, fromDay, toDay, presets, keep }: { label: string; today: string; fromDay: string; toDay: string; presets: RangePreset[]; keep: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [monthStart, setMonthStart] = useState(pickMonthStart({ day: toDay }))
  const [picks, setPicks] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const close = () => setIsOpen(false)
  const toggle = () => {
    if (!isOpen) {
      setPicks([])
      setMonthStart(pickMonthStart({ day: toDay }))
    }
    setIsOpen(!isOpen)
  }
  useCloseOnOutside({ isOpen, rootRef, onClose: close })

  return (
    <div ref={rootRef} className="relative">
      <button type="button" aria-expanded={isOpen} aria-haspopup="true" onClick={toggle} className={BUTTON_CLASS}>
        <CalendarIcon className="text-sm h-5 text-home-on-surface-variant" />
        <span>{label}</span>
      </button>
      {isOpen ? (
        <div className="absolute left-0 top-full mt-2 z-20 w-72 bg-home-surface-container-lowest border border-home-outline-variant/70 rounded-xl p-3 flex flex-col gap-3">
          <MonthHeader monthStart={monthStart} today={today} onMove={setMonthStart} />
          <MonthGrid monthStart={monthStart} today={today} marked={pickMarkedDays({ picks, fromDay, toDay })} onPick={(day) => setPicks(pickNextDays({ picks, day }))} />
          <ApplyLink picks={picks} keep={keep} onClose={close} />
          <PresetLinks presets={presets} keep={keep} onClose={close} />
        </div>
      ) : null}
    </div>
  )
}
