'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'

export type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

// How long the sheet takes to leave (globals.css, .sheet-root[data-state='closing']), plus a little margin.
const EXIT_MS = 220

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const titleId = useId()
  const closeButton = useRef<HTMLButtonElement>(null)
  // Stays mounted while it slides out, showing what it showed when it was open.
  const [shown, setShown] = useState(open)
  const [lastChildren, setLastChildren] = useState(children)
  const [lastTitle, setLastTitle] = useState(title)
  if (open && !shown) setShown(true)
  if (open && (lastChildren !== children || lastTitle !== title)) {
    setLastChildren(children)
    setLastTitle(title)
  }

  useEffect(() => {
    if (open || !shown) return
    const timer = window.setTimeout(() => setShown(false), EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [open, shown])

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    // The page behind does not scroll while the sheet is open (on iPhone it would move under the finger).
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open && !shown) return null

  // A sheet from the bottom on a phone; a centered dialog on a tablet, easier to reach.
  return (
    <div
      data-state={open ? 'open' : 'closing'}
      className="sheet-root fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
    >
      <div
        aria-hidden="true"
        data-testid="sheet-backdrop"
        className="sheet-backdrop absolute inset-0 bg-black/60"
        onClick={open ? onClose : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={!open}
        className="sheet-panel relative max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:max-w-xl md:rounded-3xl md:border md:pb-5"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="font-display text-2xl font-bold uppercase">
            {open ? title : lastTitle}
          </h2>
          <button
            ref={closeButton}
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Icon name="x" className="size-6" />
          </button>
        </div>
        {open ? children : lastChildren}
      </div>
    </div>
  )
}
