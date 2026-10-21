'use client'

import { useActionState } from 'react'
import type { FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { IDLE, type ActionState } from '@/lib/actions/result'

export type PayMethods = { cash: boolean; transfer: boolean }

// The small confirmation after "Cobrar $400": how the player paid. Only the methods the club takes. The outcome
// goes to the card (onDone, onError), which outlives this choice.
export function ChargeChoice({
  title,
  fields,
  action,
  methods,
  onDone,
  onError,
  onCancel,
}: {
  title: string
  fields: Record<string, string>
  action: FormAction
  methods: PayMethods
  onDone: (message: string) => void
  onError: (message: string) => void
  onCancel: () => void
}) {
  const [, formAction, pending] = useActionState(async (previous: ActionState, formData: FormData) => {
    // A Server Action that redirects does not come back with a state.
    const result = (await action(previous, formData)) ?? previous
    if (result.status === 'ok') onDone(result.message ?? '')
    if (result.status === 'error') onError(result.message ?? '')
    return result
  }, IDLE)
  const options = [
    ...(methods.cash ? [{ value: 'cash', label: 'Efectivo' }] : []),
    ...(methods.transfer ? [{ value: 'transfer', label: 'Me transfirió' }] : []),
  ]

  return (
    <div role="group" aria-label={title} className="flex flex-col gap-2 rounded-xl border border-accent bg-surface p-3">
      <p className="text-sm font-semibold">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <form key={option.value} action={formAction}>
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input type="hidden" name="method" value={option.value} />
            <SubmitButton label={option.label} pendingLabel="Cobrando…" fullWidth={false} />
          </form>
        ))}
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Volver
        </Button>
      </div>
    </div>
  )
}
