'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
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
    let channel: RealtimeChannel | undefined
    let stopped = false
    const reload = () => {
      clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), debounceMs)
    }

    async function start() {
      // Join with the viewer's token: otherwise the channel runs as anon, which may not read
      // court_occupancy, and Realtime rejects the subscription (RLS and column privileges apply).
      const { data } = await supabase.auth.getSession()
      if (data.session) await supabase.realtime.setAuth(data.session.access_token)
      if (stopped) return
      channel = supabase
        .channel(`occupancy:${clubId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'court_occupancy', filter: `club_id=eq.${clubId}` },
          reload,
        )
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'court_occupancy' }, reload)
        .subscribe()
    }
    void start()

    return () => {
      stopped = true
      clearTimeout(timer)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [clubId, debounceMs, router])

  return null
}
