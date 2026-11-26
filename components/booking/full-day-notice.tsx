import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'

// A day with nothing free on Reservar: the way to the next day with room ("Ver mañana (6 libres)"), or, with nothing
// free all week, that plain fact. Rendered only for a full day (the board passes `full` undefined otherwise).
export function FullDayNotice({ full }: { full: { href: string; label: string } | null }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <p className="font-semibold">{full ? 'Este día está lleno.' : 'No quedan turnos libres esta semana.'}</p>
      {full ? (
        <Link href={full.href} className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
          {full.label}
        </Link>
      ) : null}
    </div>
  )
}
