import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChampionshipBoard, type ChampionshipBoardProps } from '@/app/(jugador)/campeonatos/[id]/championship-board'
import type { ReportTransfer } from '@/components/booking/transfer-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { championshipBlocks } from '@/lib/domain/championships'
import { makeChampionship } from '../../fixtures/championships'

const ok = async () => ({ status: 'ok' as const, message: 'Listo.' })

function renderBoard(overrides: Partial<ChampionshipBoardProps> = {}) {
  const props: ChampionshipBoardProps = {
    name: 'Campeonato de Primavera',
    statusLabel: 'Inscripción abierta',
    cancelled: false,
    dates: ['sábado 17 de octubre, 08:00 a 14:00', 'domingo 18 de octubre, 14:00 a 20:00'],
    closes: 'viernes 16 de octubre, 08:00',
    rules: 'Al mejor de 3 sets.',
    posterUrl: null,
    paymentNote: 'Se paga en el club o por transferencia.',
    categories: [
      { id: 'k1', name: '6ta Libre', detail: 'Libre · $2.000 por pareja', playRules: 'Al mejor de 3 sets, sin límite de tiempo', spots: '1 de 4 parejas', full: false, available: false, reason: 'Ya estás anotado en esta categoría.' },
      { id: 'k2', name: '5ta Damas', detail: 'Damas · $1.800 por pareja', playRules: 'Al mejor de 3 sets, con 50 minutos de juego', spots: '8 de 8 parejas · 1 en espera', full: true, available: true, reason: null },
    ],
    entries: [
      {
        entryId: 'e1', categoryName: '6ta Libre', partnerName: 'Pedro', stateText: 'Con lugar', waiting: false,
        payment: { state: 'pending', due: 2000, canReportTransfer: true, rejectionReason: null }, hoursText: 'Pueden jugar en cualquier horario.',
        canWithdraw: true, canEditHours: true, unavailable: [], note: null,
      },
    ],
    blocks: championshipBlocks(makeChampionship().windows),
    maxUnavailable: 2,
    members: [{ userId: '66666666-6666-6666-6666-666666666666', name: 'Bruno Silva' }],
    myLevel: 5,
    viewerId: 'u-ana',
    transfer: { details: 'Banco Ejemplo', receiptRequired: true },
    initialCategoryId: null,
    actions: {
      register: vi.fn<FormAction>(ok),
      withdraw: vi.fn<FormAction>(ok),
      hours: vi.fn<FormAction>(ok),
      report: vi.fn<ReportTransfer>(),
    },
    ...overrides,
  }
  render(<ChampionshipBoard {...props} />)
  return props
}

describe('ChampionshipBoard', () => {
  it('shows the championship, its rules, its categories and your pairs', () => {
    renderBoard()
    expect(screen.getByRole('heading', { name: 'Campeonato de Primavera' })).toBeInTheDocument()
    expect(screen.getByText('Al mejor de 3 sets, con 50 minutos de juego')).toBeInTheDocument()
    expect(screen.getByText('sábado 17 de octubre, 08:00 a 14:00')).toBeInTheDocument()
    expect(screen.getByText('Hasta el viernes 16 de octubre, 08:00')).toBeInTheDocument()
    expect(screen.getByText('Al mejor de 3 sets.')).toBeInTheDocument()
    const categories = screen.getByRole('region', { name: 'Categorías' })
    expect(categories).toHaveTextContent('8 de 8 parejas · 1 en espera')
    expect(categories).toHaveTextContent('Ya estás anotado en esta categoría.')
    expect(within(screen.getByRole('region', { name: 'Tus inscripciones' })).getByText('Con Pedro')).toBeInTheDocument()
  })

  it('opens the sheet on the category tapped', async () => {
    renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Anotarme en 5ta Damas' }))
    const sheet = screen.getByRole('dialog', { name: 'Anotarme' })
    expect(within(sheet).getByRole('combobox', { name: 'Categoría' })).toHaveValue('k2')
    expect(within(sheet).getByRole('button', { name: 'Anotarnos en la lista de espera' })).toBeInTheDocument()
  })

  it('opens the sheet from a shared link with the category', () => {
    renderBoard({ initialCategoryId: 'k2' })
    expect(screen.getByRole('dialog', { name: 'Anotarme' })).toBeInTheDocument()
  })

  it('asks before withdrawing and sends the pair', async () => {
    const props = renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Darme de baja' }))
    const sheet = screen.getByRole('dialog', { name: 'Darme de baja' })
    expect(sheet).toHaveTextContent('Se da de baja la pareja con Pedro en 6ta Libre.')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sí, darnos de baja' }))
    await waitFor(() => expect(props.actions.withdraw).toHaveBeenCalled())
    expect(vi.mocked(props.actions.withdraw).mock.calls[0][1].get('entryId')).toBe('e1')
    expect(await screen.findByRole('status')).toHaveTextContent('Listo.')
  })

  it('opens the hours and the transfer', async () => {
    renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Horarios imposibles' }))
    expect(screen.getByRole('dialog', { name: 'Horarios imposibles' })).toHaveTextContent('Hasta 2 de 6')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))
    expect(screen.getByRole('dialog', { name: 'Ya transferí' })).toHaveTextContent('$2.000')
  })

  it('says when the club cancelled it', () => {
    renderBoard({ cancelled: true, statusLabel: 'Cancelado', entries: [] })
    expect(screen.getByRole('note')).toHaveTextContent('El club canceló este campeonato. Si pagaste, te devuelve la plata.')
  })
})
