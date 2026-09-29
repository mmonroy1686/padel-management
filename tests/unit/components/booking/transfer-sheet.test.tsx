import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  TransferSheet,
  type ReportTransfer,
  type TransferSheetProps,
  type UploadReceipt,
} from '@/components/booking/transfer-sheet'

const FILE = new File(['png'], 'comprobante.png', { type: 'image/png' })

function renderSheet(overrides: Partial<TransferSheetProps> = {}) {
  const props: TransferSheetProps = {
    bookingId: 'b1',
    userId: 'u1',
    amount: 1600,
    details: 'Banco Ejemplo, cuenta 123',
    receiptRequired: true,
    reportAction: vi.fn<ReportTransfer>(async () => ({ status: 'ok', message: 'Listo, le avisamos al club.' })),
    upload: vi.fn<UploadReceipt>(async () => ({ path: 'u1/b1-1.png' })),
    onClose: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  }
  render(<TransferSheet {...props} />)
  return props
}

describe('TransferSheet', () => {
  it('shows the amount and where to transfer', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Ya transferí' })
    expect(dialog).toHaveTextContent('$1.600')
    expect(dialog).toHaveTextContent('Banco Ejemplo, cuenta 123')
  })

  it('uploads the receipt and reports the transfer', async () => {
    const props = renderSheet()
    await userEvent.upload(screen.getByLabelText('Comprobante'), FILE)
    await userEvent.click(screen.getByRole('button', { name: 'Informar transferencia' }))
    await waitFor(() => expect(props.onDone).toHaveBeenCalledWith('Listo, le avisamos al club.'))
    expect(props.upload).toHaveBeenCalledWith('u1', 'b1', FILE)
    expect(props.reportAction).toHaveBeenCalledWith('b1', 'u1/b1-1.png')
  })

  it('does not report when the upload fails', async () => {
    const props = renderSheet({
      upload: vi.fn<UploadReceipt>(async () => ({ error: 'No pudimos subir el comprobante. Probá de nuevo.' })),
    })
    await userEvent.upload(screen.getByLabelText('Comprobante'), FILE)
    await userEvent.click(screen.getByRole('button', { name: 'Informar transferencia' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos subir el comprobante')
    expect(props.reportAction).not.toHaveBeenCalled()
  })

  it('reports without a receipt when the club does not ask for one', async () => {
    const props = renderSheet({ receiptRequired: false })
    expect(screen.getByLabelText('Comprobante (opcional)')).not.toBeRequired()
    await userEvent.click(screen.getByRole('button', { name: 'Informar transferencia' }))
    await waitFor(() => expect(props.reportAction).toHaveBeenCalledWith('b1', null))
    expect(props.upload).not.toHaveBeenCalled()
  })
})
