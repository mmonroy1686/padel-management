// A 1x1 PNG: enough for Storage to accept it as a receipt.
export const RECEIPT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

export const RECEIPT_FILE = { name: 'comprobante.png', mimeType: 'image/png', buffer: RECEIPT_PNG }
