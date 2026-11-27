import type { Metadata } from 'next'
import { ClubList } from '@/components/platform/club-list'
import { Icon } from '@/components/ui/icon'
import { NewClubForm } from '@/components/platform/new-club-form'
import { requestOrigin } from '@/lib/auth/request-origin'
import { clubDomainSuffix } from '@/lib/club/host'
import { loadPlatformClubs } from '@/lib/data/platform'
import { byAttention, overviewText } from '@/lib/domain/platform-trial'
import { localDateOf } from '@/lib/domain/time'
import { createClub } from './actions'
import { requirePlatform } from './require-platform'

export const metadata: Metadata = { title: 'Plataforma', robots: { index: false } }

// Every club and how its trial goes: what needs attention first, and its next step. A row opens the club's page.
export default async function PlatformPage() {
  await requirePlatform('/plataforma')
  const [clubs, origin] = await Promise.all([loadPlatformClubs(), requestOrigin()])
  const now = new Date()
  const domain = clubDomainSuffix(process.env, origin)
  // The overview counts days in Montevideo: one line for every club, close enough for a summary.
  const today = localDateOf(now, 'America/Montevideo')

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-8 px-4 py-10 md:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold uppercase">Plataforma</h1>
        <p className="text-fg-muted">{overviewText(clubs, today)}</p>
      </header>

      {clubs.length > 0 ? (
        <ClubList clubs={byAttention(clubs, today)} now={now} />
      ) : (
        <p className="text-fg-muted">Todavía no hay clubes. Creá el primero acá abajo.</p>
      )}

      <details className="group rounded-xl border border-border" open={clubs.length === 0}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold">
          Nuevo club
          <Icon name="chevron-down" className="size-5 text-fg-muted transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="border-t border-border p-4">
          {domain ? (
            <NewClubForm action={createClub} domain={domain} />
          ) : (
            <p className="text-fg-muted">
              Para crear clubes hace falta el dominio: cada club vive en su subdominio. Cargá{' '}
              <code>NEXT_PUBLIC_ROOT_DOMAIN</code> en Vercel (README, «Un club por subdominio») y volvé a desplegar.
            </p>
          )}
        </div>
      </details>
    </main>
  )
}
