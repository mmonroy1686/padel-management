'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Reloads the current screen when an aviso arrives for the viewer (the bell's count, Inicio's banner),
// like LiveOccupancy does for the courts. Realtime applies the select policy: only her own avisos.
export function LiveNotifications({ userId, debounceMs = 300 }: { userId: string; debounceMs?: number }) {
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
      // Join with the viewer's token, so RLS applies (otherwise the channel runs as anon).
      const { data } = await supabase.auth.getSession()
      if (data.session) await supabase.realtime.setAuth(data.session.access_token)
      if (stopped) return
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          reload,
        )
        .subscribe()
    }
    void start()

    return () => {
      stopped = true
      clearTimeout(timer)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [userId, debounceMs, router])

  return null
}
