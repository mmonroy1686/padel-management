import 'server-only'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { flushOutbox } from '@/lib/notify/outbox'

// Every screen reads bookings and occupancies, so any write refreshes the whole app. Any write may also
// free a court and queue an aviso (the waitlist): it is mailed once the response is out.
export function revalidateBookings(): void {
  revalidatePath('/', 'layout')
  after(async () => {
    try {
      await flushOutbox()
    } catch (error) {
      console.error('No se pudieron mandar los avisos', error)
    }
  })
}
