// The icons of the form design as inline SVG (24-unit grid, Material shapes),
// so the page needs no icon font. Each icon follows the text size of the
// element it sits in (see .form-icon in form.css).

interface IconProps {
  className?: string
}

function SvgIcon({ className, path }: IconProps & { path: string }) {
  return (
    <svg className={'form-icon' + (className ? ' ' + className : '')} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  )
}

export function ArrowBackIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
}

export function CheckCircleIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M16.59 7.58 10 14.17l-3.59-3.58L5 12l5 5 8-8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
}

export function BoltIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z" />
}

export function CalendarTodayIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z" />
}

export function DeleteIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z" />
}

export function SearchIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
}

export function CloseIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
}

export function CategoryIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z" />
}

export function AddIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
}

export function PaletteIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm5.5 11c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm-3-4c-.83 0-1.5-.67-1.5-1.5S13.67 6 14.5 6s1.5.67 1.5 1.5S15.33 9 14.5 9zM5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S7.33 13 6.5 13 5 12.33 5 11.5zm6-4c0 .83-.67 1.5-1.5 1.5S8 8.33 8 7.5 8.67 6 9.5 6s1.5.67 1.5 1.5z" />
}

export function ExpandLessIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />
}

export function ExpandMoreIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" />
}

export function CheckIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
}

export function ColorizeIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M20.71 5.63l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-3.12 3.12-1.93-1.91-1.41 1.41 1.42 1.42L3 16.25V21h4.75l8.92-8.92 1.42 1.42 1.41-1.41-1.92-1.92 3.12-3.12c.4-.4.4-1.03.01-1.42zM6.92 19 5 17.08l8.06-8.06 1.92 1.92L6.92 19z" />
}

export function SquareIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M3 3v18h18V3H3zm16 16H5V5h14v14z" />
}

export function CropSquareIcon({ className }: IconProps) {
  return <SvgIcon className={className} path="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
}
