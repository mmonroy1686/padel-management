import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CHAMPIONSHIP_STATUS_LABELS, datesText, openCategories, type Championship } from '@/lib/domain/championships'

// Design: "Campeonatos" in the Torneos tab, and the club's list. Signing up goes through the detail page.
export function ChampionshipCard({
  championship,
  href,
  actionLabel,
  primary = false,
  posterUrl = null,
}: {
  championship: Championship
  // championshipPosterUrl: the banner on top of the card when the club uploaded one.
  posterUrl?: string | null
  href: string
  actionLabel: string
  primary?: boolean
}) {
  const categories = openCategories(championship)
  return (
    <Card className="flex h-full flex-col gap-3">
      {posterUrl ? (
        // A plain img, as on the championship's page: the poster comes from Storage at its own size.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl}
          alt={`Afiche de ${championship.name}`}
          loading="lazy"
          className="max-h-64 w-full rounded-xl bg-bg object-contain"
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-bold uppercase">{championship.name}</p>
          <p className="text-sm text-fg-muted">{datesText(championship)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
          {CHAMPIONSHIP_STATUS_LABELS[championship.status]}
        </span>
      </div>
      <p className="text-sm">
        {categories.length > 0 ? categories.map((category) => category.name).join(' · ') : 'Sin categorías todavía'}
      </p>
      <Link href={href} className={buttonClasses({ variant: primary ? 'primary' : 'secondary', fullWidth: true, className: 'mt-auto' })}>
        {actionLabel}
      </Link>
    </Card>
  )
}
