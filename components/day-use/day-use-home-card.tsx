import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { DayUseHome } from '@/lib/domain/day-use'
import { StampRow } from './stamp-row'

// Design: "Inicio", the day use card: stamps, today's pass and "Hoy: N en el club".
export function DayUseHomeCard({ home }: { home: DayUseHome }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Day use</h2>
        <Link href="/day-use" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink underline">
          Ver day use
        </Link>
      </div>
      {home.rule.enabled ? <StampRow loyalty={home.loyalty} rule={home.rule} /> : null}
      {home.todayPass ? (
        <Link href={`/day-use/pase/${home.todayPass.id}`} className={buttonClasses({ fullWidth: true })}>
          Tu pase de hoy: {home.todayPass.text}
        </Link>
      ) : (
        <Link href="/day-use" className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
          Comprar un pase
        </Link>
      )}
      {home.todayText ? <p className="text-sm text-fg-muted">{home.todayText}</p> : null}
    </Card>
  )
}
