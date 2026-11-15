import Image from 'next/image'
import Link from 'next/link'
import { ArrowForwardIcon } from '@/home/components/icons'

// The "create" row of the design: the illustration, the title with one line of description, and the create button,
// which opens the new-discount page.
const BUTTON_CLASS =
  'shrink-0 whitespace-nowrap bg-home-primary-container hover:bg-home-primary text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2'
const ARTICLE_CLASS =
  'bg-home-surface-container-lowest border border-home-outline-variant/70 rounded-xl p-4 flex items-center gap-4 hover:border-home-outline transition-colors'

export default function CreateCards() {
  return (
    <section>
      <article className={ARTICLE_CLASS}>
        <div className="shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden bg-home-surface-container-low border border-home-outline-variant/40">
          <Image src="/assets/home/tier-illustration.jpg" alt="Tier-based discount concept illustration" width={512} height={286} unoptimized className="w-full h-full object-cover object-center" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-home-on-surface tracking-tight mb-1">Tier-based Discount</h2>
          <p className="max-w-md line-clamp-2 text-sm text-home-on-surface-variant">
            Reward bigger orders. Offer percentage off or a fixed price as customers add more units of a product.
          </p>
        </div>
        <Link href="/discounts/new" className={BUTTON_CLASS}>
          Create Discount
          <ArrowForwardIcon className="text-[16px]" />
        </Link>
      </article>
    </section>
  )
}
