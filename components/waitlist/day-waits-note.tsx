import { Icon } from '@/components/ui/icon'

// /reservar: what she asked to be told about on the day shown, so signing up leaves a mark on the screen.
export function DayWaitsNote({ items, onOpen }: { items: string[]; onOpen: () => void }) {
  if (items.length === 0) return null
  return (
    <section
      aria-labelledby="te-avisamos"
      className="flex items-start gap-3 rounded-2xl border border-accent bg-surface p-3"
    >
      <Icon name="bell" className="mt-0.5 shrink-0 text-accent-ink" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="te-avisamos" className="font-semibold">
          Te avisamos si se libera
        </h2>
        <ul className="text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-semibold text-accent-ink underline"
      >
        Ver o cancelar
      </button>
    </section>
  )
}
