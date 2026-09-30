import type { InsidePerson } from '@/lib/domain/day-use'
import { timeIn } from '@/lib/domain/format'

// Design: "Ya están en el club". day_use_inside already leaves out who chose to hide.
export function InsideList({ people, timezone }: { people: InsidePerson[]; timezone: string }) {
  return (
    <section aria-labelledby="en-el-club" className="flex flex-col gap-2">
      <h2 id="en-el-club" className="font-display text-2xl font-bold uppercase">
        Ya están en el club
      </h2>
      {people.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {people.map((person, index) => (
            <li key={`${person.name}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl border border-border p-3">
              <span className="font-semibold">{person.name}</span>
              <span className="text-sm text-fg-muted">
                {person.productName}, desde las {timeIn(person.checkedInAt, timezone)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted">Todavía no llegó nadie.</p>
      )}
      <p className="text-xs text-fg-muted">Si no querés aparecer en esta lista, cambialo en tu perfil.</p>
    </section>
  )
}
