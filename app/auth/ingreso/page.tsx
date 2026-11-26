import type { Metadata } from 'next'
import { ClubLogo } from '@/components/brand/club-logo'
import { SubmitButton } from '@/components/ui/submit-button'
import { Card } from '@/components/ui/card'
import { safeNextPath } from '@/lib/auth/redirect'
import { getClub } from '@/lib/auth/viewer'
import { matchPreviewMetadata } from '@/lib/data/share-preview'
import { signInWithGoogle } from './actions'
import { EmailSignIn } from './email-sign-in'
import { LegalLinks } from '@/components/legal/legal-links'

type SearchParams = Promise<{ next?: string; error?: string }>

const MATCH_PREFIX = '/partidos/'

// A shared match link opened without a session lands here (requirePlayer): WhatsApp follows that redirect, so the
// preview of the match is given here too.
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const path = safeNextPath((await searchParams).next)
  const matchId = path.startsWith(MATCH_PREFIX) ? path.slice(MATCH_PREFIX.length) : null
  return (matchId ? await matchPreviewMetadata(matchId) : null) ?? { title: 'Ingresar' }
}

const ERROR_MESSAGES: Record<string, string> = {
  callback: 'El enlace venció o ya se usó: cada mail sirve una vez y pedir otro anula los anteriores. Pedí un código nuevo.',
  'otro-navegador':
    'El enlace se abrió en otro navegador. Pedí un código nuevo y escribilo acá: así no importa dónde se abra el mail.',
  google: 'No pudimos conectar con Google. Probá de nuevo o usá tu email.',
}

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { next, error } = await searchParams
  const nextPath = safeNextPath(next)
  // hasOwn so "?error=constructor" does not pick up Object.prototype.
  const errorMessage = error && Object.hasOwn(ERROR_MESSAGES, error) ? ERROR_MESSAGES[error] : null

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <ClubLogo club={await getClub()} className="size-16" />
      <h1 className="font-display text-4xl font-bold uppercase">Ingresar</h1>

      {errorMessage ? (
        <p role="alert" className="rounded-xl border border-border bg-surface p-3">
          {errorMessage}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4 sm:p-6" data-fill-buttons>
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={nextPath} />
          <SubmitButton label="Seguir con Google" pendingLabel="Abriendo Google…" icon={<GoogleMark />} />
        </form>
        <div className="flex items-center gap-3 text-sm text-fg-muted">
          <span className="h-px flex-1 bg-border" />o con tu email<span className="h-px flex-1 bg-border" />
        </div>
        <EmailSignIn next={nextPath} />
      </Card>
      <LegalLinks />
    </main>
  )
}

// Google's mark, as its sign-in guidelines ask for the button.
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 shrink-0 rounded-full bg-white p-0.5">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.5z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  )
}
