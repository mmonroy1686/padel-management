import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/auth/viewer'
import { cn } from '@/lib/cn'
import { scheduleOf } from '@/lib/data/day'
import { addMonths, isMonth, monthGrid, monthOf, summarizeDays, weekOf } from '@/lib/domain/calendar'
import { dayLongLabel, monthLabel, WEEKDAYS_LONG } from '@/lib/domain/format'
import { holderLabel } from '@/lib/domain/payments-overview'
import { isLocalDate } from '@/lib/domain/input'
import { shortDate, SKIP_REASON_LABELS, type SkipReason } from '@/lib/domain/series'
import { daySlots } from '@/lib/domain/slots'
import { addDays, formatMinutes, localDateOf, parseLocalDate, parseTime, toDate, zonedTime } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Calendario' }

const WEEK_HEADERS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const TOGGLE = 'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold'

type SearchParams = Promise<{ vista?: string; mes?: string; dia?: string }>

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireStaff('/club/calendario')
  const { club } = viewer
  const params = await searchParams
  const today = localDateOf(new Date(), club.timezone)
  const view = params.vista === 'semana' ? 'semana' : 'mes'
  const anchor = isLocalDate(params.dia) ? params.dia : today
  const month = isMonth(params.mes) ? params.mes : monthOf(anchor)
  const weeks = view === 'mes' ? monthGrid(month) : [weekOf(anchor)]
  const from = zonedTime(weeks[0][0], 0, club.timezone).toISOString()
  const to = zonedTime(addDays(weeks[weeks.length - 1][6], 1), 0, club.timezone).toISOString()

  const supabase = await createClient()
  const [occupancies, courts, series, skips] = await Promise.all([
    supabase.from('court_occupancy').select('starts_at, kind').eq('club_id', club.id).gte('starts_at', from).lt('starts_at', to),
    supabase.from('courts').select('id', { count: 'exact', head: true }).eq('club_id', club.id).eq('is_active', true),
    supabase
      .from('recurring_series')
      .select('id, weekday, start_time, guest_name, ends_on, court:courts(name), player:profiles!recurring_series_player_id_fkey(display_name)')
      .eq('club_id', club.id)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .order('weekday')
      .order('start_time'),
    supabase
      .from('recurring_series_skips')
      .select(
        'id, on_date, reason, series:recurring_series(start_time, guest_name, court:courts(name), player:profiles!recurring_series_player_id_fkey(display_name))',
      )
      .eq('club_id', club.id)
      .gte('on_date', today)
      .order('on_date'),
  ])
  if (occupancies.error) throw occupancies.error
  if (courts.error) throw courts.error
  if (series.error) throw series.error
  if (skips.error) throw skips.error

  const capacity = daySlots(scheduleOf(club), today).length * (courts.count ?? 0)
  const summary = summarizeDays(
    occupancies.data.map((o) => ({ startsAt: toDate(o.starts_at), kind: o.kind })),
    club.timezone,
    capacity,
  )
  const previous = view === 'mes' ? `vista=mes&mes=${addMonths(month, -1)}` : `vista=semana&dia=${addDays(anchor, -7)}`
  const next = view === 'mes' ? `vista=mes&mes=${addMonths(month, 1)}` : `vista=semana&dia=${addDays(anchor, 7)}`
  const time = (value: string) => formatMinutes(parseTime(value))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">
          {view === 'mes' ? monthLabel(month) : `Semana del ${dayLongLabel(weeks[0][0])}`}
        </h2>
        <nav aria-label="Vista" className="flex gap-2">
          <Link
            href={`/club/calendario?vista=mes&mes=${month}`}
            aria-current={view === 'mes' ? 'page' : undefined}
            className={cn(TOGGLE, view === 'mes' ? 'border-accent bg-accent text-on-accent' : 'border-border')}
          >
            Mes
          </Link>
          <Link
            href={`/club/calendario?vista=semana&dia=${anchor}`}
            aria-current={view === 'semana' ? 'page' : undefined}
            className={cn(TOGGLE, view === 'semana' ? 'border-accent bg-accent text-on-accent' : 'border-border')}
          >
            Semana
          </Link>
        </nav>
      </div>
      <div className="flex justify-between">
        <Link href={`/club/calendario?${previous}`} className="inline-flex min-h-11 items-center px-1 font-semibold text-accent-ink">
          ‹ Anterior
        </Link>
        <Link href={`/club/calendario?${next}`} className="inline-flex min-h-11 items-center px-1 font-semibold text-accent-ink">
          Siguiente ›
        </Link>
      </div>
      <table className="w-full table-fixed border-separate border-spacing-1">
        <caption className="sr-only">Ocupación por día</caption>
        <thead>
          <tr>
            {WEEK_HEADERS.map((day) => (
              <th key={day} scope="col" className="text-xs font-semibold text-fg-muted">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const daySummary = summary.get(day)
                const percent = daySummary?.percent ?? 0
                const recurring = daySummary?.recurring ?? 0
                const inMonth = view === 'semana' || monthOf(day) === month
                return (
                  <td key={day}>
                    <Link
                      href={`/club/grilla?dia=${day}`}
                      aria-label={`${dayLongLabel(day)}: ${percent}% ocupado${recurring ? `, ${recurring} turnos fijos` : ''}`}
                      className={cn(
                        'flex min-h-16 flex-col rounded-xl border p-2 text-sm hover:border-accent',
                        day === today ? 'border-accent' : 'border-border',
                        !inMonth && 'opacity-40',
                      )}
                    >
                      <span className="font-display text-lg font-bold">{parseLocalDate(day).day}</span>
                      <span>{percent}%</span>
                      {recurring > 0 ? <span className="text-xs text-fg-muted">{recurring} fijos</span> : null}
                    </Link>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <section aria-labelledby="fijos" className="flex flex-col gap-2">
        <h2 id="fijos" className="font-display text-2xl font-bold uppercase">
          Turnos fijos
        </h2>
        {series.data.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {series.data.map((item) => (
              <li key={item.id}>
                {WEEKDAYS_LONG[item.weekday]} {time(item.start_time)}, {item.court?.name}:{' '}
                {holderLabel(item)}
                {item.ends_on ? `, hasta el ${shortDate(item.ends_on)}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">No hay turnos fijos. Se cargan desde la grilla.</p>
        )}
      </section>

      <section aria-labelledby="salteadas" className="flex flex-col gap-2">
        <h2 id="salteadas" className="font-display text-2xl font-bold uppercase">
          Fechas salteadas
        </h2>
        {skips.data.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {skips.data.map((skip) => (
              <li key={skip.id}>
                {shortDate(skip.on_date)}
                {skip.series ? ` ${time(skip.series.start_time)}, ${skip.series.court?.name}, ` : ' '}
                {skip.series ? holderLabel(skip.series) : ''}:{' '}
                {SKIP_REASON_LABELS[skip.reason as SkipReason] ?? skip.reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">Ningún turno fijo quedó sin reservar.</p>
        )}
      </section>
    </>
  )
}
