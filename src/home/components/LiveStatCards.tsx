'use client'

import { useEffect, useState } from 'react'
import StatCards, { type RangeButton } from '@/home/components/StatCards'
import { buildLoadingCards } from '@/home/buildMetricCards'
import type { MetricCard } from '@/home/buildMetricCards'
import { fetchMetricCards, readSessionToken } from '@/home/fetchMetricCards'

/* eslint-disable guidelines/no-outer-scope-reads, guidelines/no-outer-scope-calls -- the effect waits on the window and reaches App Bridge there; neither is a parameter of the hook */
/** The cards: waiting values at first, the real ones once the page has loaded and the metrics route has answered. */
function useMetricCards({ metricsUrl }: { metricsUrl: string }): MetricCard[] {
  const [cards, setCards] = useState(buildLoadingCards)
  useEffect(() => {
    let isCurrent = true
    function loadCards() {
      fetchMetricCards({
        url: metricsUrl,
        readToken: () => readSessionToken({ bridge: window.shopify }),
        request: (url, init) => fetch(url, init),
      }).then((loaded) => {
        if (isCurrent) setCards(loaded)
      })
    }
    if (document.readyState === 'complete') loadCards()
    else window.addEventListener('load', loadCards, { once: true })
    return () => {
      isCurrent = false
      window.removeEventListener('load', loadCards)
    }
  }, [metricsUrl])
  return cards
}
/* eslint-enable guidelines/no-outer-scope-reads, guidelines/no-outer-scope-calls */

export default function LiveStatCards({ metricsUrl, range }: { metricsUrl: string; range: RangeButton }) {
  const cards = useMetricCards({ metricsUrl })
  return <StatCards cards={cards} range={range} />
}
