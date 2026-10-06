import Link from 'next/link'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { WEEKDAYS_LONG, WEEKDAYS_SHORT } from '@/lib/domain/format'
import { nextOccurrence, seriesByWeekday, shortDate, weeklyMinutes } from '@/lib/domain/series'
import type { LocalDate } from '@/lib/domain/time'

export type OverviewSeries = {
  id: string
  weekday: number
  startTime: string
  courtName: string
  holder: string
  endsOn: LocalDate | null
}
export type OverviewSkip = { id: string; date: LocalDate; startTime: string; courtName: string; holder: string; reason: string }

const hoursText = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`
}
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const SKIP_COLUMNS: DataColumn[] = [
  { key: 'date', label: 'Fecha', sortable: true },
  { key: 'time', label: 'Hora' },
  { key: 'court', label: 'Cancha' },
  { key: 'holder', label: 'Titular', sortable: true },
  { key: 'reason', label: 'Motivo' },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

// Calendar: the club's recurring slots as a week at a glance, and the dates one of them could not
// be booked, each with a way to fix it in the grid.
export function RecurringOverview({
  series,
  skips,
  today,
  slotMinutes,
}: {
  series: OverviewSeries[]
  skips: OverviewSkip[]
  today: LocalDate
  slotMinutes: number
}) {
  const week = seriesByWeekday(series)
  return (
    <>
      <section aria-labelledby="fijos" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="fijos" className="font-display text-2xl font-bold uppercase">
            Turnos fijos
          </h2>
          <ul aria-label="Resumen de turnos fijos" className="flex flex-wrap gap-2 text-sm">
            <li className="rounded-full border border-border bg-surface px-3 py-1.5">
              <b className="font-display text-lg tabular-nums">{series.length}</b> turnos fijos
            </li>
            <li className="rounded-full border border-border bg-surface px-3 py-1.5">
              <b className="font-display text-lg tabular-nums">{hoursText(weeklyMinutes(series, slotMinutes))}</b> por semana
            </li>
            {skips.length > 0 ? (
              <li>
                <a
                  href="#salteadas"
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-accent bg-surface px-3 font-semibold text-accent-ink hover:bg-bg"
                >
                  <b className="font-display text-lg tabular-nums">{skips.length}</b> fechas sin reservar
                </a>
              </li>
            ) : null}
          </ul>
        </div>

        {series.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-7">
            {week.map(({ weekday, items }) => (
              <section
                key={weekday}
                aria-label={WEEKDAYS_LONG[weekday]}
                className={cn('flex flex-col gap-2 rounded-2xl border border-border bg-surface p-2', items.length === 0 && 'hidden md:flex')}
              >
                <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  <span className="md:hidden">{WEEKDAYS_LONG[weekday]}</span>
                  <span className="hidden md:inline">{WEEKDAYS_SHORT[weekday]}</span>
                </h3>
                {items.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {items.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/club/grilla?dia=${nextOccurrence(item.weekday, today)}`}
                          className="flex flex-col gap-0.5 rounded-xl bg-accent p-2 text-on-accent hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <span className="font-display text-xl font-bold tabular-nums">{item.startTime}</span>
                          <span className="text-xs font-semibold">{item.courtName}</span>
                          <span className="text-sm leading-tight">{item.holder}</span>
                          {item.endsOn ? <span className="text-xs">hasta el {shortDate(item.endsOn)}</span> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-1 text-sm text-fg-muted">—</p>
                )}
              </section>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-4 text-fg-muted">
            No hay turnos fijos todavía. Se cargan desde la grilla, tocando una cancha libre.
          </p>
        )}
      </section>

      <section id="salteadas" aria-labelledby="salteadas-titulo" className="flex scroll-mt-4 flex-col gap-3">
        <div>
          <h2 id="salteadas-titulo" className="font-display text-2xl font-bold uppercase">
            Fechas sin reservar{skips.length > 0 ? ` (${skips.length})` : ''}
          </h2>
          {skips.length > 0 ? (
            <p className="text-sm text-fg-muted">
              Esos días el turno fijo no se pudo reservar. Avisale al titular o cargale otra cancha desde la grilla.
            </p>
          ) : null}
        </div>
        {skips.length > 0 ? (
          <DataTable
            caption="Fechas sin reservar"
            columns={SKIP_COLUMNS}
            rows={skips.map((item) => ({
              id: item.id,
              search: `${item.holder} ${item.courtName}`,
              sort: { date: `${item.date} ${item.startTime}`, holder: item.holder },
              cells: {
                date: <span className="font-semibold tabular-nums">{shortDate(item.date)}</span>,
                time: <span className="tabular-nums">{item.startTime}</span>,
                court: item.courtName,
                holder: item.holder,
                reason: <span className="text-fg-muted">{capitalized(item.reason)}</span>,
                actions: (
                  <Link
                    href={`/club/grilla?dia=${item.date}`}
                    aria-label={`Ver el ${shortDate(item.date)} en la grilla`}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink underline"
                  >
                    Ver en la grilla
                  </Link>
                ),
              },
            }))}
            initialSort={{ key: 'date', dir: 'asc' }}
            emptyText="Todos los turnos fijos tienen su reserva."
          />
        ) : (
          <p className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-fg-muted">
            <Icon name="check-circle" className="text-court-ink" />
            Todos los turnos fijos tienen su reserva.
          </p>
        )}
      </section>
    </>
  )
}
