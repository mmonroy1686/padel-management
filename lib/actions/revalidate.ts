import 'server-only'
import { revalidatePath } from 'next/cache'

// Every screen reads bookings and occupancies, so any write refreshes the whole app.
export function revalidateBookings(): void {
  revalidatePath('/', 'layout')
}
