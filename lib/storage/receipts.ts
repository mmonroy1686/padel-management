import { MAX_RECEIPT_BYTES, receiptPath } from '@/lib/domain/receipts'
import { createClient } from '@/lib/supabase/client'

export type UploadResult = { path: string } | { error: string }

// Uploads straight from the browser to Storage; the policy only lets the user write in her folder.
export async function uploadReceipt(userId: string, bookingId: string, file: File): Promise<UploadResult> {
  if (file.size > MAX_RECEIPT_BYTES) return { error: 'El comprobante pesa más de 5 MB. Probá con una captura de pantalla.' }
  const path = receiptPath(userId, bookingId, file.name)
  const { error } = await createClient()
    .storage.from('receipts')
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  return error ? { error: 'No pudimos subir el comprobante. Probá de nuevo.' } : { path }
}
