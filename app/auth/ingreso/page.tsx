import type { Metadata } from 'next'
import { Logo } from '@/components/brand/logo'
import { SubmitButton } from '@/components/ui/submit-button'
import { Card } from '@/components/ui/card'
import { safeNextPath } from '@/lib/auth/redirect'
import { signInWithGoogle } from './actions'
import { MagicLinkForm } from './magic-link-form'

export const metadata: Metadata = { title: 'Ingresar' }

const ERROR_MESSAGES: Record<string, string> = {
  callback: 'El enlace venció o ya se usó. Pedí uno nuevo.',
  google: 'No pudimos conectar con Google. Probá de nuevo o usá tu email.',
}

type SearchParams = Promise<{ next?: string; error?: string }>

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { next, error } = await searchParams
  const nextPath = safeNextPath(next)
  // hasOwn so "?error=constructor" does not pick up Object.prototype.
  const errorMessage = error && Object.hasOwn(ERROR_MESSAGES, error) ? ERROR_MESSAGES[error] : null

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <Logo className="size-14" />
      <h1 className="font-display text-4xl font-bold uppercase">Ingresar</h1>

      {errorMessage ? (
        <p role="alert" className="rounded-xl border border-border bg-surface p-3">
          {errorMessage}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4">
        <MagicLinkForm next={nextPath} />
        <div className="flex items-center gap-3 text-sm text-fg-muted">
          <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
        </div>
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={nextPath} />
          <SubmitButton label="Seguir con Google" pendingLabel="Abriendo Google…" variant="secondary" />
        </form>
      </Card>
    </main>
  )
}
