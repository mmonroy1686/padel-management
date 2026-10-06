'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// The public page and the TV mode have no session for Realtime: they render again every few seconds.
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(timer)
  }, [router, seconds])

  return null
}
