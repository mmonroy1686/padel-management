import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Icon, type IconName } from '@/components/ui/icon'
import {
  occupancyLine,
  type AlertKind,
  type Cancellation,
  type DayOccupancy,
  type HomeAlert,
} from '@/lib/domain/club-home'
import { formatPrice, timeIn } from '@/lib/domain/format'

const ALERT_ICONS: Record<AlertKind, IconName> = {
  forming: 'users',
  waiting: 'clock',
  tournament: 'trophy',
  championship: 'trophy',
  day_use: 'ticket',
}

const LINK = 'inline-flex min-h-11 items-center font-semibold text-accent-ink underline'

function DayCard({ id, icon, title, children }: { id: string; icon: IconName; title: string; children: ReactNode }) {
  return (
    <Card role="article" aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="flex items-center gap-2 font-display text-xl font-bold uppercase">
        <Icon name={icon} className="text-accent-ink" />
        {title}
      </h3>
      {children}
    </Card>
  )
}

// "El día": how full the courts are and the next free slots, what asks for something, and today's cancellations.
// One column on a phone, three on a desktop.
export function HomeDay({
  occupancy,
  alerts,
  cancellations,
  timezone,
}: {
  occupancy: DayOccupancy
  alerts: HomeAlert[]
  cancellations: Cancellation[]
  timezone: string
}) {
  const line = occupancyLine(occupancy)
  const refunds = cancellations.some((cancellation) => cancellation.refund > 0)
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <DayCard id="dia-ocupacion" icon="grid" title="Ocupación">
        <div
          role="progressbar"
          aria-label="Ocupación del día"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={occupancy.percent}
          aria-valuetext={line}
          className="h-2 overflow-hidden rounded-full bg-bg"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${occupancy.percent}%` }} />
        </div>
        <p className="font-semibold">{line}</p>
        {occupancy.slots.length > 0 ? (
          <ul aria-label="Próximos horarios libres" className="flex flex-wrap gap-2">
            {occupancy.slots.map((slot) => (
              <li key={slot.label} className="rounded-full border border-border px-3 py-1 text-sm font-semibold">
                {slot.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">No quedan horarios libres hoy.</p>
        )}
        <Link href="/club/grilla" className={LINK}>
          Ver la Grilla
        </Link>
      </DayCard>

      <DayCard id="dia-avisos" icon="alert" title="Avisos">
        {alerts.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {alerts.map((alert) => (
              <li key={alert.text} className="flex items-center gap-2">
                <Icon name={ALERT_ICONS[alert.kind]} className="text-accent-ink" />
                <Link href={alert.href} className={LINK}>
                  {alert.text}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">Nada pendiente.</p>
        )}
      </DayCard>

      <DayCard id="dia-cancelaciones" icon="cancel" title="Cancelaciones de hoy">
        {cancellations.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {cancellations.map((cancellation) => (
              <li key={cancellation.bookingId} className="flex flex-col">
                <span>
                  {cancellation.courtName} · {timeIn(cancellation.startsAt, timezone)} · {cancellation.holder}
                </span>
                {cancellation.refund > 0 ? (
                  <span className="text-sm font-semibold text-accent-ink">A devolver {formatPrice(cancellation.refund)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">Sin cancelaciones hoy.</p>
        )}
        {refunds ? (
          <Link href="/club/cobros#devolver" className={LINK}>
            Devolver en Cobros
          </Link>
        ) : null}
      </DayCard>
    </div>
  )
}
