import { PageSection } from '@/components/ui/page-section'
import { RowLink, RowList } from '@/components/ui/row-list'
import type { DayUseHome } from '@/lib/domain/day-use'
import { StampRow } from './stamp-row'

// Inicio's day use: the stamps, and one row to today's pass or to buy one. A quiet section, not a card: the
// screen's one big action is "Reservar cancha".
export function DayUseHomeCard({ home }: { home: DayUseHome }) {
  return (
    <PageSection id="day-use" title="Day use" more={{ href: '/day-use', label: 'Ver day use' }}>
      {home.rule.enabled ? <StampRow loyalty={home.loyalty} rule={home.rule} /> : null}
      <RowList>
        {home.todayPass ? (
          <RowLink href={`/day-use/pase/${home.todayPass.id}`} icon="ticket" title={`Tu pase de hoy: ${home.todayPass.text}`} />
        ) : (
          <RowLink href="/day-use" icon="ticket" title="Comprar un pase" />
        )}
      </RowList>
      {home.todayText ? <p className="text-sm text-fg-muted">{home.todayText}</p> : null}
    </PageSection>
  )
}
