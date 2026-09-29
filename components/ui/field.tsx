import type { ReactNode } from 'react'

export const inputClasses =
  'min-h-11 w-full rounded-xl border border-border bg-bg px-4 text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent'

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
    </div>
  )
}
