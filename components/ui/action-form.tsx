'use client'

import { useActionState, type ReactNode } from 'react'
import type { ButtonSize, ButtonVariant } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { SubmitButton } from '@/components/ui/submit-button'
import { IDLE, type ActionState } from '@/lib/actions/result'
import { cn } from '@/lib/cn'

export type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>

export type ActionFormProps = {
  action: FormAction
  submitLabel: string
  pendingLabel?: string
  variant?: ButtonVariant
  // sm and not full width: an action inside a row (Cobrar, Fijar).
  size?: ButtonSize
  icon?: ReactNode
  accessibleLabel?: string
  // Destructive actions: asks once more before submitting (SubmitButton).
  confirmLabel?: string
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
  size = 'md',
  icon,
  accessibleLabel,
  confirmLabel,
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
        <p role="alert" className="notice-in flex items-start gap-2 rounded-xl border border-danger bg-bg p-3 text-sm">
          <Icon name="alert" className="mt-0.5 size-4 text-danger" />
          <span>{state.message}</span>
        </p>
      ) : null}
      {state.status === 'ok' && !onDone ? (
        <p role="status" className="notice-in flex items-start gap-2 text-sm">
          <Icon name="check" className="mt-0.5 size-4 text-court-ink" />
          <span>{state.message}</span>
        </p>
      ) : null}
      <SubmitButton
        label={submitLabel}
        pendingLabel={pendingLabel}
        variant={variant}
        size={size}
        fullWidth={size === 'md'}
        icon={icon}
        accessibleLabel={accessibleLabel}
        confirmLabel={confirmLabel}
        pending={pending}
      />
    </form>
  )
}
