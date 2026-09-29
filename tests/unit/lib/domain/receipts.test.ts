import { describe, expect, it } from 'vitest'
import { receiptPath } from '@/lib/domain/receipts'

describe('receiptPath', () => {
  it('puts the receipt in the user folder, named after the booking', () => {
    expect(receiptPath('u1', 'b1', 'Comprobante.JPG', 123)).toBe('u1/b1-123.jpg')
  })

  it('ignores whatever the file name tries to do', () => {
    expect(receiptPath('u1', 'b1', '../../otro/x.png', 123)).toBe('u1/b1-123.png')
    expect(receiptPath('u1', 'b1', 'captura', 123)).toBe('u1/b1-123.bin')
  })
})
