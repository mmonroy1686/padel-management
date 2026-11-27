import { formatPrice, shortDate } from '@/lib/domain/format'
import { weekBookings, weekOccupancy, weekOnlineShare, type ClubWeek } from '@/lib/domain/platform-trial'

const pct = (value: number | null) => (value === null ? '–' : `${value}%`)

function delta(now: number | null, before: number | null, unit = ''): string | null {
  if (now === null || before === null) return null
  const diff = now - before
  if (diff === 0) return 'igual'
  return `${diff > 0 ? '+' : ''}${diff}${unit}`
}

// The last full week against the one before. The current week is still going, so it only shows in the table.
export function WeekStats({ weeks }: { weeks: ClubWeek[] }) {
  const full = weeks.slice(0, -1)
  const last = full.at(-1) ?? null
  const before = full.at(-2) ?? null
  const stats = last
    ? [
        { label: 'Reservas', value: String(weekBookings(last)), delta: delta(weekBookings(last), before ? weekBookings(before) : null) },
        { label: 'Online', value: pct(weekOnlineShare(last)), delta: delta(weekOnlineShare(last), before ? weekOnlineShare(before) : null, ' pts') },
        { label: 'Ocupación', value: pct(weekOccupancy(last)), delta: delta(weekOccupancy(last), before ? weekOccupancy(before) : null, ' pts') },
        { label: 'Activos', value: String(last.activePlayers), delta: delta(last.activePlayers, before?.activePlayers ?? null) },
        { label: 'Cobrado', value: formatPrice(last.amount), delta: null },
      ]
    : []

  if (!last) return <p className="text-fg-muted">Todavía no hay una semana completa.</p>
  return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">
            Semana del {shortDate(last.week)}{before ? ', contra la anterior' : ''}
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <dt className="text-sm text-fg-muted">{stat.label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{stat.value}</dd>
                {stat.delta ? <dd className="text-sm tabular-nums text-fg-muted">{stat.delta}</dd> : null}
              </div>
            ))}
          </dl>
        </div>
  )
}

// Every week, the current one first and marked as going.
export function WeeksTable({ weeks }: { weeks: ClubWeek[] }) {
  return (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[56rem] text-sm tabular-nums">
          <caption className="sr-only">Las últimas {weeks.length} semanas, de la actual a la más vieja</caption>
          <thead className="bg-surface text-left text-fg-muted">
            <tr>
              <th scope="col" className="sticky left-0 bg-surface px-3 py-2 font-semibold">Semana</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Reservas</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Online</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Ocupación</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Activos</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Nuevos</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Canceladas</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Recuperados</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Cobrado</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Faltazos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...weeks].reverse().map((week, index) => (
              <tr key={week.week}>
                <th scope="row" className="sticky left-0 bg-bg px-3 py-2 text-left font-semibold">
                  {shortDate(week.week)}
                  {index === 0 ? <span className="ml-1 font-normal text-fg-muted">(en curso)</span> : null}
                </th>
                <td className="px-3 py-2 text-right">{weekBookings(week)}</td>
                <td className="px-3 py-2 text-right">{pct(weekOnlineShare(week))}</td>
                <td className="px-3 py-2 text-right">{pct(weekOccupancy(week))}</td>
                <td className="px-3 py-2 text-right">{week.activePlayers}</td>
                <td className="px-3 py-2 text-right">{week.newPlayers}</td>
                <td className="px-3 py-2 text-right">
                  {week.cancelled}
                  {week.cancelledLate > 0 ? <span className="text-fg-muted"> ({week.cancelledLate} tarde)</span> : null}
                </td>
                <td className="px-3 py-2 text-right">{week.recovered}</td>
                <td className="px-3 py-2 text-right">{formatPrice(week.amount)}</td>
                <td className="px-3 py-2 text-right">
                  {week.noShows}
                  {week.played > 0 ? <span className="text-fg-muted"> de {week.played}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  )
}
