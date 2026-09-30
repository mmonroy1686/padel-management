import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MatchBoard, type MatchBoardProps } from '@/app/(jugador)/partidos/[id]/match-board'
import type { FormAction } from '@/components/ui/action-form'
import { makeMatch } from '../../fixtures/matches'

function renderBoard(overrides: Partial<MatchBoardProps> = {}) {
  const props: MatchBoardProps = {
    match: makeMatch(),
    viewerId: 'me',
    whenText: 'jueves 1 de octubre, 20:00',
    status: { ok: true, position: 2, text: 'Podés sumarte de revés.' },
    joinable: [2, 4],
    initialJoin: null,
    risk: null,
    howItWorks: 'La cancha se reserva recién cuando están los 4.',
    paymentNote: 'Se paga en el club o por transferencia.',
    closeHours: 3,
    leave: null,
    shareText: 'Falta 3',
    joinAction: vi.fn<FormAction>(),
    leaveAction: vi.fn<FormAction>(),
    ...overrides,
  }
  render(<MatchBoard {...props} />)
}

describe('MatchBoard', () => {
  it('opens the join sheet from a spot on the court', async () => {
    renderBoard()
    await userEvent.click(screen.getAllByRole('button', { name: 'Sumarme de revés' })[0])
    expect(screen.getByRole('dialog', { name: 'Sumarte de revés' })).toBeInTheDocument()
  })

  it('opens it straight away from a shared "Sumarme" link', () => {
    renderBoard({ initialJoin: 4 })
    expect(screen.getByRole('dialog', { name: 'Sumarte de revés' })).toBeInTheDocument()
  })

  it('says why the viewer cannot join or leave', () => {
    renderBoard({
      status: { ok: false, text: 'Es un partido femenino.' },
      joinable: [],
      leave: { allowed: false, reason: 'Ya no podés bajarte: faltan menos de 24 h. Avisá al club.' },
    })
    expect(screen.getByText('No podés sumarte: es un partido femenino.')).toBeInTheDocument()
    expect(screen.getByText('Ya no podés bajarte: faltan menos de 24 h. Avisá al club.')).toBeInTheDocument()
  })

  it('tells why a match was cancelled', () => {
    renderBoard({ match: makeMatch({ status: 'cancelled', cancelReason: 'not_filled' }), status: { ok: false, text: '' } })
    expect(screen.getByText('Se canceló. No se completó a tiempo.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compartir en WhatsApp' })).not.toBeInTheDocument()
  })
})
