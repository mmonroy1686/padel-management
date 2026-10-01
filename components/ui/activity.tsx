'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type Report = (delta: 1 | -1) => void

const ActivityContext = createContext<Report | null>(null)

// Counts what is running (Server Actions, navigations) and shows one loading bar at the top
// while anything is.
export function ActivityProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(0)
  const report = useCallback<Report>((delta) => setRunning((count) => Math.max(0, count + delta)), [])

  return (
    <ActivityContext.Provider value={report}>
      {running > 0 ? <LoadingBar /> : null}
      <Suspense fallback={null}>
        <NavigationActivity />
      </Suspense>
      {children}
    </ActivityContext.Provider>
  )
}

export function useReportActivity(active: boolean) {
  const report = useContext(ActivityContext)
  useEffect(() => {
    if (!active || !report) return
    report(1)
    return () => report(-1)
  }, [active, report])
}

// Screens are rendered on the server, so a tap on a link can wait a moment with nothing on screen.
// Any click on a link to another screen of the app lights the bar until the new route is in.
function NavigationActivity() {
  const route = `${usePathname()}?${useSearchParams()?.toString() ?? ''}`
  const current = useRef(route)
  // The route the click left from: loading while the app is still on it, done once the route changes.
  const [leaving, setLeaving] = useState<string | null>(null)
  const navigating = leaving === route
  useReportActivity(navigating)

  useEffect(() => {
    current.current = route
    // Arrived: forget where the click started, so coming back there later does not light the bar.
    if (leaving === null || leaving === route) return
    const frame = requestAnimationFrame(() => setLeaving(null))
    return () => cancelAnimationFrame(frame)
  }, [route, leaving])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]')
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || link.hasAttribute('download')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      setLeaving(current.current)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // Never stuck: a navigation that fails or is cancelled turns the bar off on its own.
  useEffect(() => {
    if (!navigating) return
    const timer = window.setTimeout(() => setLeaving(null), 15_000)
    return () => window.clearTimeout(timer)
  }, [navigating])

  return null
}

function LoadingBar() {
  return (
    <div role="progressbar" aria-label="Cargando" className="loading-bar fixed inset-x-0 top-0 z-50 h-1 overflow-hidden">
      <div className="loading-bar-fill h-full bg-accent" />
    </div>
  )
}
