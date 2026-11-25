'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { useReportActivity } from '@/components/ui/activity'
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button'
import { Spinner } from '@/components/ui/icon'

type SubmitButtonProps = {
  label: string
  pendingLabel?: string
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  // Something before the label, e.g. an icon.
  icon?: ReactNode
  // For forms whose action does more than the form submit itself (e.g. an upload first).
  pending?: boolean
  // When the visible label is short and repeats in a list ("Fijar"): which one it is, for screen readers.
  accessibleLabel?: string
  // For what cannot be undone: the first tap only asks ("¿Seguro? Tocá de nuevo"), the second one submits. If the
  // second tap does not come in a few seconds, it goes back to the label.
  confirmLabel?: string
}

const CONFIRM_MS = 3000

// Submits its form; while the action runs it shows a spinner and lights the top loading bar.
export function SubmitButton({
  label,
  pendingLabel = label,
  variant,
  size,
  fullWidth = true,
  icon,
  pending: forced,
  accessibleLabel,
  confirmLabel,
}: SubmitButtonProps) {
  const status = useFormStatus()
  const pending = forced ?? status.pending
  useReportActivity(pending)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), CONFIRM_MS)
    return () => window.clearTimeout(timer)
  }, [armed])

  if (confirmLabel && !armed && !pending) {
    return (
      // Its own key and preventDefault: React would otherwise reuse this <button>, turn it into type="submit" during
      // the click, and the browser would submit on the first tap.
      <Button
        key="ask"
        type="button"
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        aria-label={accessibleLabel}
        onClick={(event) => {
          event.preventDefault()
          setArmed(true)
        }}
      >
        {icon}
        {label}
      </Button>
    )
  }

  return (
    <Button
      key="submit"
      type="submit"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={armed && !pending ? confirmLabel : accessibleLabel}
    >
      {pending ? <Spinner /> : icon}
      {pending ? pendingLabel : armed ? confirmLabel : label}
    </Button>
  )
}
