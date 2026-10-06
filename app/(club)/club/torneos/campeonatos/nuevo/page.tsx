import type { Metadata } from 'next'
import { ChampionshipDetailsForm } from '@/components/championships/championship-details-form'
import { BackLink } from '@/components/ui/back-link'
import { Card } from '@/components/ui/card'
import { requireStaff } from '@/lib/auth/viewer'
import { localDateOf } from '@/lib/domain/time'
import { createChampionship } from '../actions'

export const metadata: Metadata = { title: 'Nuevo campeonato' }

export default async function NewChampionshipPage() {
  const viewer = await requireStaff('/club/torneos/campeonatos/nuevo')
  return (
    <>
      <BackLink href="/club/torneos">Volver a torneos</BackLink>
      <h2 className="font-display text-2xl font-bold uppercase">Nuevo campeonato</h2>
      <p className="text-fg-muted">
        Primero los datos. Después agregás los días de juego y las categorías, y abrís la inscripción.
      </p>
      <Card>
        <ChampionshipDetailsForm
          action={createChampionship}
          submitLabel="Crear campeonato"
          pendingLabel="Creando…"
          today={localDateOf(new Date(), viewer.club.timezone)}
        />
      </Card>
    </>
  )
}
