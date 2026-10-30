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
