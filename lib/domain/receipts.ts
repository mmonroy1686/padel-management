export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024

const EXTENSION = /\.([a-z0-9]{1,5})$/i

// Object name inside the receipts bucket: <user_id>/<booking_id>-<timestamp>.<ext>.
// The first folder is what the Storage policy and report_transfer check; the user's file name
// only contributes its extension.
export function receiptPath(userId: string, bookingId: string, fileName: string, now = Date.now()): string {
  const extension = EXTENSION.exec(fileName)?.[1]?.toLowerCase() ?? 'bin'
  return `${userId}/${bookingId}-${now}.${extension}`
}
