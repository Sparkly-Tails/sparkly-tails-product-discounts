import type { ReactNode } from 'react'
import HomeHeader from '@/home/components/HomeHeader'
import { homeFont } from '@/home/homeFont'

// The frame of the tier discount form pages: the app's header, the design's light
// palette and typeface, and the 1400px column the design uses.
export default function FormPage({ children }: { children: ReactNode }) {
  return (
    <div className={homeFont.variable + ' font-form bg-form-surface text-form-on-surface min-h-screen antialiased'}>
      <HomeHeader />
      <main className="w-full max-w-[1400px] mx-auto px-form-lg py-form-lg">{children}</main>
    </div>
  )
}
