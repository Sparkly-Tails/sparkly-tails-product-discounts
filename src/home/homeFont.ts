import { Inter } from 'next/font/google'

// The design's typeface, self-hosted by Next. `variable` is a class that sets
// --font-inter on the element it is put on (the homepage wrapper).
export const homeFont = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter', display: 'swap' })
