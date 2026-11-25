import type { ReactNode, Ref } from 'react'
import { Icon } from '@/components/ui/icon'

// What an action did, shown where the screen continues (the grid, a match, a pass). Its own look, apart from errors
// (border-danger and the alert icon in ActionForm); it eases in, and the X takes it away.
export function Notice({ children, onDismiss, ref }: { children: ReactNode; onDismiss?: () => void; ref?: Ref<HTMLParagraphElement> }) {
  return (
    <div className="notice-in flex items-start gap-2 rounded-xl border border-court-ink bg-surface py-1 pl-3 pr-1">
      <Icon name="check-circle" className="mt-2.5 size-5 text-court-ink" />
      <p ref={ref} role="status" className="flex-1 py-2">
        {children}
      </p>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Ocultar aviso"
          onClick={onDismiss}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon name="x" className="size-5" />
        </button>
      ) : null}
    </div>
  )
}
