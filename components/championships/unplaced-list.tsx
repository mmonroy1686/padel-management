import Link from 'next/link'

export type UnplacedItem = { id: string; title: string; reason: string; href: string }

// Design: "lo no ubicado con motivo", each with a way to place it by hand.
export function UnplacedList({ items }: { items: UnplacedItem[] }) {
  return (
    <section aria-labelledby="sin-lugar" className="flex flex-col gap-2 rounded-2xl border border-accent p-4">
      <h3 id="sin-lugar" className="font-display text-xl font-bold uppercase">
        Sin lugar
      </h3>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1">
            <span className="font-semibold">{item.title}</span>
            <span className="text-sm">{item.reason}</span>
            <Link
              href={item.href}
              aria-label={`Ubicar a mano: ${item.title}`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink underline"
            >
              Ubicar a mano
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
