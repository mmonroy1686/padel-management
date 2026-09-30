'use client'

import { useFormStatus } from 'react-dom'
import { useReportActivity } from '@/components/ui/activity'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { Spinner } from '@/components/ui/icon'

type SubmitButtonProps = {
  label: string
  pendingLabel?: string
  variant?: ButtonVariant
  fullWidth?: boolean
  // For forms whose action does more than the form submit itself (e.g. an upload first).
  pending?: boolean
}

// Submits its form; while the action runs it shows a spinner and lights the top loading bar.
export function SubmitButton({ label, pendingLabel = label, variant, fullWidth = true, pending: forced }: SubmitButtonProps) {
  const status = useFormStatus()
  const pending = forced ?? status.pending
  useReportActivity(pending)

  return (
    <Button type="submit" variant={variant} fullWidth={fullWidth} disabled={pending} aria-busy={pending || undefined}>
      {pending ? <Spinner /> : null}
      {pending ? pendingLabel : label}
    </Button>
  )
}
