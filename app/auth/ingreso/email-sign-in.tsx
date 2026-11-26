'use client'

import { useActionState, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { parseSignInCode, SIGN_IN_CODE_LENGTH } from '@/lib/auth/sign-in-code'
import { sendMagicLink, verifySignInCode, type MagicLinkState, type SignInCodeState } from './actions'

type SendAction = (previous: MagicLinkState, form: FormData) => Promise<MagicLinkState>
type VerifyAction = (previous: SignInCodeState, form: FormData) => Promise<SignInCodeState>

export type EmailSignInProps = { next: string; sendAction?: SendAction; verifyAction?: VerifyAction }

const INPUT =
  'min-h-11 rounded-xl border border-border bg-bg px-4 text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent'

// Ingresar with the email: one mail with a 6-digit code (typed here, in this browser) and a link. "Usar otro email"
// starts over with a fresh form.
export function EmailSignIn(props: EmailSignInProps) {
  const [round, setRound] = useState(0)
  return <EmailSignInRound key={round} {...props} onRestart={() => setRound((value) => value + 1)} />
}

function EmailSignInRound({
  next,
  sendAction = sendMagicLink,
  verifyAction = verifySignInCode,
  onRestart,
}: EmailSignInProps & { onRestart: () => void }) {
  const [sent, sendFormAction, sending] = useActionState(sendAction, { status: 'idle' })

  if (sent.status === 'sent' && sent.email) {
    return <CodeStep email={sent.email} next={next} sendAction={sendAction} verifyAction={verifyAction} onRestart={onRestart} />
  }

  return (
    <form action={sendFormAction} className="flex flex-col gap-3">
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
        defaultValue={sent.email}
        className={INPUT}
      />
      {sent.status === 'error' ? (
        <p role="alert" className="text-sm">
          {sent.message}
        </p>
      ) : null}
      <SubmitButton label="Mandarme un código" pendingLabel="Mandando…" variant="secondary" pending={sending} />
    </form>
  )
}

function CodeStep({
  email,
  next,
  sendAction,
  verifyAction,
  onRestart,
}: {
  email: string
  next: string
  sendAction: SendAction
  verifyAction: VerifyAction
  onRestart: () => void
}) {
  const form = useRef<HTMLFormElement>(null)
  const [checked, verifyFormAction, verifying] = useActionState(verifyAction, { status: 'idle' })
  const [resent, resendFormAction, resending] = useActionState(sendAction, { status: 'idle' })

  return (
    <div className="flex flex-col gap-3">
      <p role="status">
        Te mandamos un mail a <strong className="break-all">{email}</strong>. Escribí el código de {SIGN_IN_CODE_LENGTH} números o tocá el
        enlace del mail. Si no llega en un minuto, mirá en spam o promociones.
      </p>
      <form ref={form} action={verifyFormAction} className="flex flex-col gap-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <label htmlFor="sign-in-code" className="text-sm font-semibold">
          Código del mail
        </label>
        <input
          id="sign-in-code"
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={SIGN_IN_CODE_LENGTH + 2}
          className={`${INPUT} font-display text-2xl tracking-[0.3em] tabular-nums`}
          onChange={(event) => {
            // Six digits typed or pasted (or suggested by the phone): in, without another tap.
            if (!verifying && parseSignInCode(event.currentTarget.value)) form.current?.requestSubmit()
          }}
        />
        {checked.status === 'error' ? (
          <p role="alert" className="text-sm">
            {checked.message}
          </p>
        ) : null}
        <SubmitButton label="Entrar" pendingLabel="Entrando…" pending={verifying} />
      </form>
      <div className="flex flex-wrap gap-2">
        <form action={resendFormAction}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="ghost" size="sm" disabled={resending}>
            Mandar otro código
          </Button>
        </form>
        <Button variant="ghost" size="sm" onClick={onRestart}>
          Usar otro email
        </Button>
      </div>
      {resending ? null : resent.status === 'sent' ? (
        <p role="status" className="text-sm">
          Te mandamos otro código. El anterior ya no sirve.
        </p>
      ) : resent.status === 'error' ? (
        <p role="alert" className="text-sm">
          {resent.message}
        </p>
      ) : null}
    </div>
  )
}
