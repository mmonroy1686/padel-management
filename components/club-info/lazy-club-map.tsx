'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { ClubMapProps } from './club-map'

const ClubMap = dynamic(() => import('./club-map'), {
  ssr: false,
  loading: () => <MapPlaceholder />,
})

function MapPlaceholder() {
  return <div aria-hidden="true" className="h-48 w-full rounded-xl border border-border bg-bg" />
}

// Leaflet only in the browser, and on Inicio only once the map is about to show, so it adds nothing to the first load.
export function LazyClubMap({ whenVisible = false, ...props }: ClubMapProps & { whenVisible?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(!whenVisible)
  useEffect(() => {
    if (near || !box.current) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true)
    }, { rootMargin: '300px' })
    observer.observe(box.current)
    return () => observer.disconnect()
  }, [near])
  return <div ref={box}>{near ? <ClubMap {...props} /> : <MapPlaceholder />}</div>
}
