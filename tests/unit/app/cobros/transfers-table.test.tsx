import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TransfersTable } from '@/app/(club)/club/cobros/transfers-table'
import type { FormAction } from '@/components/ui/action-form'

const TRANSFERS = [
  { id: 't1', amount: 1600, holder: 'Ana López', when: 'jueves 1 de octubre, 20:00', at: 2, courtName: 'Cancha 1', receiptUrl: 'https://x/r1.png' },
  { id: 't2', amount: 400, holder: 'Bruno Silva', when: 'viernes 2 de octubre, 18:00', at: 3, courtName: 'Torneo Americano', receiptUrl: null },
]

describe('TransfersTable', () => {
  it('lists the transfers to confirm with their receipt, and reviews one in a sheet', async () => {
    const confirm = vi.fn<FormAction>(async () => ({ status: 'ok', message: 'Pago confirmado.' }))
    render(<TransfersTable transfers={TRANSFERS} confirmAction={confirm} rejectAction={vi.fn<FormAction>()} />)
    const ana = screen.getByRole('cell', { name: 'Ana López' }).closest('tr') as HTMLElement
    expect(ana).toHaveTextContent('$1.600')
    expect(within(ana).getByRole('link', { name: 'Ver comprobante de Ana López' })).toHaveAttribute('href', 'https://x/r1.png')
    const bruno = screen.getByRole('cell', { name: 'Bruno Silva' }).closest('tr') as HTMLElement
    expect(bruno).toHaveTextContent('Sin comprobante')
    await userEvent.click(within(ana).getByRole('button', { name: 'Revisar la transferencia de Ana López' }))
    const sheet = screen.getByRole('dialog', { name: 'Transferencia de Ana López' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
  })
})
