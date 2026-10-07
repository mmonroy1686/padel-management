import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import type { ZoneView } from '@/lib/domain/championship-views'

// Design: "zonas con su tabla": position, pair, played, won, sets and games; the leader stands out; a tie the
// organizer decides; footer adds what the page needs under a group ("Cerrar zona").
export function ZonesView({ zones, footer }: { zones: ZoneView[]; footer?: (zone: ZoneView) => ReactNode }) {
  if (zones.length === 0) return null
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {zones.map((zone) => (
        <Card key={zone.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-xl font-bold uppercase">{zone.name}</h3>
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {zone.closed ? 'Cerrada' : zone.complete ? 'Completa' : 'En juego'}
            </span>
          </div>
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">{`Tabla de ${zone.name}`}</caption>
            <colgroup>
              <col className="w-9" />
              <col />
              <col className="w-9" />
              <col className="w-9" />
              <col className="w-12" />
              <col className="w-14" />
            </colgroup>
            <thead>
              <tr className="text-[0.7rem] uppercase tracking-wide text-fg-muted">
                <th scope="col" className="py-1.5">
                  <span className="sr-only">Posición</span>#
                </th>
                <th scope="col" className="py-1.5">Pareja</th>
                <th scope="col" className="py-1.5 text-center">
                  <abbr title="Partidos jugados">PJ</abbr>
                </th>
                <th scope="col" className="py-1.5 text-center">
                  <abbr title="Partidos ganados">PG</abbr>
                </th>
                <th scope="col" className="py-1.5 text-center">Sets</th>
                <th scope="col" className="py-1.5 text-center">Games</th>
              </tr>
            </thead>
            <tbody>
              {zone.rows.map((row, index) => (
                <tr key={row.entryId} className="border-t border-border align-middle">
                  <td className="py-2">
                    <span
                      className={cn(
                        'grid size-7 place-items-center rounded-full font-display text-sm font-bold tabular-nums',
                        index === 0 ? 'bg-accent text-on-accent' : 'bg-bg text-fg-muted ring-1 ring-border',
                      )}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td className={cn('py-2 pr-2 leading-tight', index === 0 && 'font-semibold')}>{row.name}</td>
                  <td className="py-2 text-center tabular-nums text-fg-muted">{row.played}</td>
                  <td className="py-2 text-center font-display text-base font-bold tabular-nums">{row.won}</td>
                  <td className="py-2 text-center tabular-nums">{row.sets}</td>
                  <td className="py-2 text-center tabular-nums text-fg-muted">{row.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {zone.tiedNames.length > 0 ? (
            <p className="rounded-xl border border-accent p-2 text-sm">{`Empate a definir: ${zone.tiedNames.join('; ')}.`}</p>
          ) : null}
          {footer ? footer(zone) : null}
        </Card>
      ))}
    </div>
  )
}
