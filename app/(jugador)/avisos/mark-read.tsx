'use client'

import { useEffect } from 'react'

// Opening /avisos marks them read (a page does not write while it renders). The action revalidates,
// so the bell goes quiet.
export function MarkRead({ action }: { action: () => Promise<void> }) {
  useEffect(() => {
    void action()
  }, [action])
  return null
}
