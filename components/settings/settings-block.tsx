import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { sectionOf } from '@/lib/club/settings-sections'

// The top of a settings screen: the section's name and what goes in it.
export function SettingsHeader({ href }: { href: string }) {
  const section = sectionOf(href)
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-display text-3xl font-bold uppercase">{section.label}</h2>
      <p className="text-fg-muted">{section.description}</p>
    </div>
  )
}

// One group of settings inside a screen: a titled region with a short help line and its card.
export function SettingsBlock({
  id,
  title,
  description,
  card = true,
  children,
}: {
  id: string
  title: string
  description?: ReactNode
  // Tables bring their own surface; forms go in a card.
  card?: boolean
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id={id} className="font-display text-xl font-bold uppercase">
          {title}
        </h3>
        {description ? <p className="max-w-prose text-sm text-fg-muted">{description}</p> : null}
      </div>
      {card ? <Card>{children}</Card> : children}
    </section>
  )
}
