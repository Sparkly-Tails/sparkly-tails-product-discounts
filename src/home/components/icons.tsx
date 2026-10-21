// The icons of the homepage design as inline SVG (24-unit grid, Material
// "outlined" shapes), so the page needs no icon font. Each icon follows the
// text size of the element it sits in (see .home-icon in home.css).

interface IconProps {
  className?: string
}

// `title` only gives a hover hint (the icon stays hidden from screen readers).
function SvgIcon({ className, path, title }: IconProps & { path: string; title?: string }) {
  return (
    <svg className={'home-icon' + (className ? ' ' + className : '')} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {title ? <title>{title}</title> : null}
      <path d={path} />
    </svg>
  )
}

export function CalendarIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z" />
}

export function InfoIcon({ className, title }: IconProps & { title?: string }) {
  return <SvgIcon className={className} title={title} path="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
}

export function LayersIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16zm0-11.47L17.74 9 12 13.47 6.26 9 12 4.53z" />
}

export function ScheduleIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
}

export function FilterListIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
}

export function SwapVertIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z" />
}

export function SearchIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
}

export function ChevronLeftIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
}

export function ChevronRightIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
}

export function ArrowForwardIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
}

export function LightbulbIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 0 1 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z" />
}

// The "stacked lines" mark of a tier-based discount and the clock of a
// time-based one, as drawn in the table rows of the design.
export function TierTypeIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M4 6h16v2H4zm2 5h12v2H6zm3 5h6v2H9z" />
}

export function TimeTypeIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z" />
}
