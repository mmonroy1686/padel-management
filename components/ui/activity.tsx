'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type Report = (delta: 1 | -1) => void

const ActivityContext = createContext<Report | null>(null)

// Counts what is running (Server Actions, tab navigations) and shows one loading bar at the top
// while anything is.
export function ActivityProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(0)
  const report = useCallback<Report>((delta) => setRunning((count) => Math.max(0, count + delta)), [])

  return (
    <ActivityContext.Provider value={report}>
      {running > 0 ? <LoadingBar /> : null}
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

function LoadingBar() {
  return (
    <div role="progressbar" aria-label="Cargando" className="loading-bar fixed inset-x-0 top-0 z-50 h-1 overflow-hidden">
      <div className="loading-bar-fill h-full bg-accent" />
    </div>
  )
}
