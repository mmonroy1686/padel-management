import type { ChampionshipStatus } from './championships'
import type { TournamentStatus } from './tournaments'

// The club's Torneos page: championships and americanos as cards, grouped by stage, what is live first.

export type EventRow = {
  id: string
  name: string
  when: string
  // When it starts, for ordering.
  at: number
  status: string
  statusLabel: string
  // Who is in: "17 parejas · 2 en espera", "6 de 8 jugadores".
  people: string
  href: string
  // Championships: what reception does next.
  nextStep?: string | null
}

export type GroupTone = 'live' | 'open' | 'setup' | 'draft' | 'past'

export type EventGroup = {
  key: string
  title: string
  statuses: readonly string[]
  tone: GroupTone
  // Shown closed at the end: what is over.
  folded?: boolean
}

const PAST: EventGroup = { key: 'past', title: 'Terminados y cancelados', statuses: ['finished', 'cancelled'], tone: 'past', folded: true }

export const CHAMPIONSHIP_GROUPS: EventGroup[] = [
  { key: 'live', title: 'En juego', statuses: ['in_progress'] satisfies ChampionshipStatus[], tone: 'live' },
  { key: 'open', title: 'Inscripción abierta', statuses: ['registration'] satisfies ChampionshipStatus[], tone: 'open' },
  { key: 'setup', title: 'Armando el fixture', statuses: ['closed', 'drawn', 'published'] satisfies ChampionshipStatus[], tone: 'setup' },
  { key: 'draft', title: 'Borradores', statuses: ['draft'] satisfies ChampionshipStatus[], tone: 'draft' },
  PAST,
]

export const TOURNAMENT_GROUPS: EventGroup[] = [
  { key: 'live', title: 'En juego', statuses: ['in_progress'] satisfies TournamentStatus[], tone: 'live' },
  { key: 'open', title: 'Inscripción abierta', statuses: ['registration'] satisfies TournamentStatus[], tone: 'open' },
  { key: 'closed', title: 'Inscripción cerrada', statuses: ['closed'] satisfies TournamentStatus[], tone: 'setup' },
  PAST,
]

export type GroupedEvents = EventGroup & { rows: EventRow[] }

// The groups that have events, in order: soonest first, latest first in the folded one.
export function groupEvents(rows: EventRow[], groups: EventGroup[]): GroupedEvents[] {
  return groups.flatMap((group) => {
    const inGroup = rows
      .filter((row) => group.statuses.includes(row.status))
      .sort((a, b) => (group.folded ? b.at - a.at : a.at - b.at))
    return inGroup.length > 0 ? [{ ...group, rows: inGroup }] : []
  })
}

const NEXT_STEP: Partial<Record<ChampionshipStatus, string>> = {
  draft: 'Siguiente: abrir la inscripción',
  registration: 'Siguiente: cerrar la inscripción',
  closed: 'Siguiente: sortear',
  drawn: 'Siguiente: programar y publicar el fixture',
  published: 'Fixture publicado',
}

export function championshipNextStep(status: ChampionshipStatus): string | null {
  return NEXT_STEP[status] ?? null
}
