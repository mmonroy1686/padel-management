import { Card } from '@/components/ui/card'
import type { DayWait } from '@/lib/domain/waitlist'

// Design: next to the grid, like "Partidos armándose": who waits that day and for what. The demand the
// club could not serve.
export function WaitingPanel({ waits }: { waits: DayWait[] }) {
  return (
    <section aria-labelledby="en-espera" className="flex flex-col gap-3">
      <h2 id="en-espera" className="font-display text-2xl font-bold uppercase">
        En espera
      </h2>
      {waits.length === 0 ? (
        <p className="text-sm text-fg-muted">Nadie espera turno este día.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {waits.map((wait) => (
            <li key={wait.id}>
              <Card className="flex flex-col gap-1">
                <p className="font-semibold">{wait.playerName}</p>
                <p className="text-sm">{wait.text}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
