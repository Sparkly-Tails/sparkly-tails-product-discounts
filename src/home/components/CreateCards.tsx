import Image from 'next/image'
import Link from 'next/link'
import { ArrowForwardIcon, LayersIcon } from '@/home/components/icons'

// The "create" card of the design. The create button opens the new-discount page; "More information"
// has no destination yet.
const BUTTON_CLASS =
  'bg-home-primary-container hover:bg-home-primary text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5'
const MORE_INFO_CLASS = 'text-xs font-medium text-home-primary hover:underline inline-flex items-center gap-1'
const ARTICLE_CLASS =
  'bg-home-surface-container-lowest border border-home-outline-variant/70 rounded-xl p-5 flex flex-col justify-between hover:border-home-outline transition-colors group'
const IMAGE_CLASS = 'w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-300'

export default function CreateCards() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <article className={ARTICLE_CLASS}>
        <div>
          <div className="rounded-lg overflow-hidden bg-home-surface-container-low aspect-video w-full mb-4 border border-home-outline-variant/40">
            <Image src="/assets/home/tier-illustration.jpg" alt="Tier-based discount concept illustration" width={512} height={286} unoptimized className={IMAGE_CLASS} />
          </div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-home-secondary bg-home-secondary-fixed/50 px-2 py-0.5 rounded-full">
              <LayersIcon className="text-[13px]" />
              Tier-based discount
            </span>
          </div>
          <h2 className="text-base font-bold text-home-on-surface tracking-tight mb-1.5">Tier-based discount</h2>
          <p className="text-xs leading-relaxed text-home-on-surface-variant mb-6">
            Reward bigger orders. Offer percentage off or a fixed price as customers add more units of a product.
          </p>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-home-outline-variant/30">
          <Link href="/discounts/new" className={BUTTON_CLASS}>
            Create tier discount
            <ArrowForwardIcon className="text-[15px]" />
          </Link>
          <a className={MORE_INFO_CLASS} href="#">More information</a>
        </div>
      </article>
    </section>
  )
}
