import type { ReactNode } from 'react'

export const inputClasses =
  'min-h-11 w-full rounded-xl border border-border bg-bg px-4 text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent'

// A label over its input, and an optional line of help under it (`<htmlFor>-hint`, for aria-describedby).
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
