'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'
import { cn } from '@/lib/cn'
import { canGoBack, nextHistory, readHistory } from '@/lib/domain/nav-history'

const KEY = 'nav-history'
// Fired after each step, so the button reads the stack again.
const CHANGED = 'nav-history-changed'

function stored(): string[] {
  try {
    return readHistory(window.sessionStorage.getItem(KEY))
  } catch {
    return []
  }
}

function store(stack: string[]) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(stack))
    window.dispatchEvent(new Event(CHANGED))
  } catch {
    // Private mode or storage blocked: "Volver" still works for this visit, it just forgets on reload.
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  return () => window.removeEventListener(CHANGED, onChange)
}

// "Volver": back to the screen this tab was on before, inside the app (an installed app has no browser back).
// It shows once there is somewhere to go back to.
export function BackButton({ className }: { className?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const show = useSyncExternalStore(subscribe, () => canGoBack(stored()), () => false)

  useEffect(() => {
    store(nextHistory(stored(), pathname))
  }, [pathname])

  if (!show) return null
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-accent-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent',
        className,
      )}
    >
      <span aria-hidden="true" className="text-xl leading-none">
        ‹
      </span>
      Volver
    </button>
  )
}
