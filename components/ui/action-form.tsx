'use client'

import { useActionState, type ReactNode } from 'react'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { IDLE, type ActionState } from '@/lib/actions/result'
import { cn } from '@/lib/cn'

export type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>

export type ActionFormProps = {
  action: FormAction
  submitLabel: string
  pendingLabel?: string
  variant?: ButtonVariant
  onDone?: (message: string) => void
  className?: string
  children?: ReactNode
}

// Runs a Server Action and shows its outcome in place. An error keeps the form (and its sheet)
// open; a success goes to onDone, or is shown here when nobody handles it.
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = 'Guardando…',
  variant = 'primary',
  onDone,
  className,
  children,
}: ActionFormProps) {
  const [state, formAction, pending] = useActionState(async (previous: ActionState, formData: FormData) => {
    // A Server Action that redirects does not come back with a state.
    const result = (await action(previous, formData)) ?? previous
    if (result.status === 'ok') onDone?.(result.message ?? '')
    return result
  }, IDLE)

  return (
    <form action={formAction} className={cn('flex flex-col gap-3', className)}>
      {children}
      {state.status === 'error' ? (
        <p role="alert" className="rounded-xl border border-accent bg-bg p-3 text-sm">
          {state.message}
        </p>
      ) : null}
      {state.status === 'ok' && !onDone ? (
        <p role="status" className="text-sm">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" variant={variant} fullWidth disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  )
}
