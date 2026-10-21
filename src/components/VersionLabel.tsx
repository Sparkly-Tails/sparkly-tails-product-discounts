'use client'

import { usePathname } from 'next/navigation'

// The small "v<version>" label every page shows at the top right. The
// homepage has the version in its own footer, so the label is left out there.
export default function VersionLabel({ version }: { version: string }) {
  const pathname = usePathname()
  if (pathname === '/') return null
  return <div className="text-xs text-subtle text-right px-4 pt-1">v{version}</div>
}
