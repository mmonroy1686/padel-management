'use client'

import type { ReactNode } from 'react'
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
}

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
}: SubmitButtonProps) {
  const status = useFormStatus()
  const pending = forced ?? status.pending
  useReportActivity(pending)

  return (
    <Button type="submit" variant={variant} size={size} fullWidth={fullWidth} disabled={pending} aria-busy={pending || undefined} aria-label={accessibleLabel}>
      {pending ? <Spinner /> : icon}
      {pending ? pendingLabel : label}
    </Button>
  )
}
