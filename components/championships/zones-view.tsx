import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import type { ZoneView } from '@/lib/domain/championship-views'

// Design: "zonas con su tabla": played, won, sets and games; a tie the organizer decides; footer adds what the
// page needs under a group ("Cerrar zona").
export function ZonesView({ zones, footer }: { zones: ZoneView[]; footer?: (zone: ZoneView) => ReactNode }) {
  if (zones.length === 0) return null
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {zones.map((zone) => (
        <Card key={zone.id} className="flex flex-col gap-2">
          <h3 className="font-display text-xl font-bold uppercase">{zone.name}</h3>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{`Tabla de ${zone.name}`}</caption>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-fg-muted">
                <th scope="col" className="py-1">Pareja</th>
                <th scope="col" className="py-1 text-right">PJ</th>
                <th scope="col" className="py-1 text-right">PG</th>
                <th scope="col" className="py-1 text-right">Sets</th>
                <th scope="col" className="py-1 text-right">Games</th>
              </tr>
            </thead>
            <tbody>
              {zone.rows.map((row, index) => (
                <tr key={row.entryId} className="border-t border-border">
                  <td className="py-1.5">{`${index + 1}. ${row.name}`}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.played}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.won}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.sets}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {zone.tiedNames.length > 0 ? (
            <p className="text-sm">{`Empate a definir: ${zone.tiedNames.join('; ')}.`}</p>
          ) : null}
          {footer ? footer(zone) : null}
        </Card>
      ))}
    </div>
  )
}
