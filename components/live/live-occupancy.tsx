'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Reloads the current screen when a court is taken or freed anywhere in the club. It does not
// patch state by hand: the server renders the day again. Realtime cannot filter deletes, so those
// come unfiltered (with only the id) and trigger a reload too.
export function LiveOccupancy({ clubId, debounceMs = 300 }: { clubId: string; debounceMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | undefined
    const reload = () => {
      clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), debounceMs)
    }
    const channel = supabase
      .channel(`occupancy:${clubId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'court_occupancy', filter: `club_id=eq.${clubId}` },
        reload,
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'court_occupancy' }, reload)
      .subscribe()

    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [clubId, debounceMs, router])

  return null
}
