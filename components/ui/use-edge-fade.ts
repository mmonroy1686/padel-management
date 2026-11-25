'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// A row that scrolls sideways on a phone (the club's tabs, the days): the edge that has more fades out
// (.tab-scroll in globals.css), and the current item is brought into view. `key` re-centers when it changes.
export function useEdgeFade<T extends HTMLElement>(key: unknown, enabled = true) {
  const ref = useRef<T>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const el = ref.current
    if (!el || !enabled) return
    setMore({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 })
  }, [enabled])
  useEffect(() => {
    if (!enabled) return
    ref.current?.querySelector('[aria-current]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [enabled, key, measure])

  return {
    ref,
    onScroll: enabled ? measure : undefined,
    'data-more-left': enabled ? String(more.left) : undefined,
    'data-more-right': enabled ? String(more.right) : undefined,
  }
}
