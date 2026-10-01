import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PassStaffCard } from '@/components/day-use/pass-staff-card'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { BackLink } from '@/components/ui/back-link'
import { requireStaff } from '@/lib/auth/viewer'
import { loadPassByCode } from '@/lib/data/day-use'
import { isPassCode } from '@/lib/domain/day-use'
import { dayLongLabel } from '@/lib/domain/format'
import { localDateOf } from '@/lib/domain/time'
import { cancelPass, checkInPass, recordPassCash } from '../../actions'

export const metadata: Metadata = { title: 'Pase de day use' }

type Params = Promise<{ codigo: string }>

// What the pass QR opens. A player who opens it lands in Inicio (requireStaff sends non-staff home).
export default async function PassByCodePage({ params }: { params: Params }) {
  const { codigo } = await params
  const code = decodeURIComponent(codigo).toUpperCase()
  const viewer = await requireStaff(`/club/day-use/pase/${encodeURIComponent(code)}`)
  if (!isPassCode(code)) notFound()
  const { club } = viewer
  const pass = await loadPassByCode(club, code)
  if (!pass) notFound()
  const today = localDateOf(new Date(), club.timezone)

  return (
    <>
      <LiveOccupancy clubId={club.id} />
      <BackLink href="/club/day-use">Volver a day use</BackLink>
      <div>
        <h2 className="font-display text-2xl font-bold uppercase">Pase {pass.code}</h2>
        <p className="text-fg-muted">
          {dayLongLabel(pass.date)}
          {pass.date === today ? ' (hoy)' : ''}
        </p>
      </div>
      <PassStaffCard
        pass={pass}
        today={today}
        timezone={club.timezone}
        acceptsCash={club.accepts_cash}
        actions={{ checkIn: checkInPass, cash: recordPassCash, cancel: cancelPass }}
      />
    </>
  )
}
