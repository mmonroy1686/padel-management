import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TournamentBoard, type TournamentBoardProps } from '@/app/(jugador)/torneos/[id]/tournament-board'
import type { ReportTransfer } from '@/components/booking/transfer-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { TIMEZONE } from '../../fixtures/grid'
import { makeEntries, makeGame, makeTournament } from '../../fixtures/tournaments'

function renderBoard(overrides: Partial<TournamentBoardProps> = {}) {
  const props: TournamentBoardProps = {
    tournament: makeTournament(),
    viewerId: 'me',
    myEntryId: null,
    whenText: 'jueves 1 de octubre, 18:00 a 20:20',
    timezone: TIMEZONE,
    status: { ok: true, text: 'Inscribirme, $400' },
    leave: null,
    payment: null,
    paymentNote: 'Se paga en el club o por transferencia.',
    transfer: { details: 'Banco Ejemplo', receiptRequired: true },
    shareText: 'Americano',
    ranking: [],
    initialJoin: false,
    joinAction: vi.fn<FormAction>(),
    leaveAction: vi.fn<FormAction>(),
    reportAction: vi.fn<ReportTransfer>(),
    ...overrides,
  }
  render(<TournamentBoard {...props} />)
  return props
}

describe('TournamentBoard', () => {
  it('shows the tournament and who signed up, and asks before signing up', async () => {
    renderBoard()
    expect(screen.getByRole('heading', { name: 'Americano de octubre' })).toBeInTheDocument()
    expect(screen.getByText('jueves 1 de octubre, 18:00 a 20:20')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Anotados (5 de 8)' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme, $400' }))
    expect(screen.getByRole('dialog', { name: 'Inscribirme' })).toHaveTextContent('Podés darte de baja mientras la inscripción esté abierta')
    expect(screen.getByRole('button', { name: 'Confirmar inscripción' })).toBeInTheDocument()
  })

  it('opens the sign-up sheet straight from the card link', () => {
    renderBoard({ initialJoin: true })
    expect(screen.getByRole('dialog', { name: 'Inscribirme' })).toBeInTheDocument()
  })

  it('says why the player cannot sign up', () => {
    renderBoard({ status: { ok: false, text: 'Es un torneo femenino.' } })
    expect(screen.getByRole('note')).toHaveTextContent('No podés anotarte: es un torneo femenino.')
    expect(screen.queryByRole('button', { name: /Inscribirme/ })).not.toBeInTheDocument()
  })

  it('lets a signed-up player pay by transfer and leave', async () => {
    renderBoard({
      myEntryId: 'e1',
      status: { ok: false, text: 'Ya estás anotado.' },
      leave: { allowed: true },
      payment: { state: 'pending', due: 400, canReportTransfer: true, rejectionReason: null },
    })
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
    expect(screen.getByRole('dialog', { name: 'Ya transferí' })).toHaveTextContent('Banco Ejemplo')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Darme de baja' }))
    expect(screen.getByRole('dialog', { name: 'Darme de baja' })).toBeInTheDocument()
  })

  it('shows the live ranking and the fixture while it is played', () => {
    renderBoard({
      tournament: makeTournament({ status: 'in_progress', entries: makeEntries(8), games: [makeGame('g1', ['e1', 'e2'], ['e3', 'e4'], 14)] }),
      status: { ok: false, text: 'La inscripción está cerrada.' },
      ranking: [{ entryId: 'e1', name: 'Jugador 1', position: 1, points: 14, played: 1, won: 1, diff: 4 }],
    })
    expect(screen.getByRole('heading', { name: 'Ranking en vivo' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Ranking' })).toHaveTextContent('Jugador 1')
    expect(screen.getAllByRole('group')[0]).toHaveTextContent('Ronda 1')
    expect(screen.queryByRole('heading', { name: /Anotados/ })).not.toBeInTheDocument()
  })

  it('shows the final ranking once it finished', () => {
    renderBoard({ tournament: makeTournament({ status: 'finished' }), status: { ok: false, text: 'La inscripción está cerrada.' } })
    expect(screen.getByRole('heading', { name: 'Ranking final' })).toBeInTheDocument()
  })

  it('offers sharing while registration is open', async () => {
    renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Compartir en WhatsApp' }))
    expect(screen.getByRole('dialog', { name: 'Compartir en el grupo' })).toBeInTheDocument()
  })
})
