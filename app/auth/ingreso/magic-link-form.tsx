'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import { sendMagicLink, type MagicLinkState } from './actions'

const initialState: MagicLinkState = { status: 'idle' }

export function MagicLinkForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState)

  if (state.status === 'sent') {
    return (
      <p role="status" className="text-lg">
        Revisá tu email: te mandamos un enlace para entrar.
      </p>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="text-sm font-semibold">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="vos@email.com"
        className="min-h-11 rounded-xl border border-border bg-bg px-4 text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
      />
      {state.status === 'error' ? (
        <p role="alert" className="text-sm">
          {state.message}
        </p>
      ) : null}
      <SubmitButton label="Enviarme el enlace" pendingLabel="Enviando…" pending={pending} />
    </form>
  )
}
