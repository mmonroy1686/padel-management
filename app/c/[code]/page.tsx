import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AutoRefresh } from '@/components/live/auto-refresh'
import { getSiteUrl } from '@/lib/auth/redirect'
import { loadPublicChampionship } from '@/lib/data/championship-fixture'
import { isPublicCode } from '@/lib/domain/championship-public'
import { brackets, byDay, championshipShareText, matchViews, zoneViews } from '@/lib/domain/championship-views'
import { CHAMPIONSHIP_STATUS_LABELS, datesText, matchRulesText } from '@/lib/domain/championships'
import { localDateOf } from '@/lib/domain/time'
import { PublicBoard } from './public-board'

export const metadata: Metadata = { title: 'Campeonato en vivo' }

type Params = Promise<{ code: string }>

// Design: the page to share, no session needed; it renders again every 15 seconds.
export default async function PublicChampionshipPage({ params }: { params: Params }) {
  const { code } = await params
  if (!isPublicCode(code)) notFound()
  const data = await loadPublicChampionship(code)
  if (!data) notFound()

  const { championship, fixture } = data
  const ctx = {
    timezone: data.timezone,
    today: localDateOf(new Date(), data.timezone),
    courtName: new Map(data.courts.map((court) => [court.id, court.name])),
  }
  const views = matchViews(championship, fixture, ctx)
  const zones = zoneViews(championship, fixture)
  const allBrackets = brackets(championship, views)
  const categories =
    fixture.matches.length === 0
      ? []
      : championship.categories.map((category) => ({
          id: category.id,
          name: category.name,
          rules: matchRulesText(category),
          zones: zones.filter((zone) => zone.categoryId === category.id),
          bracket: allBrackets.find((bracket) => bracket.categoryId === category.id) ?? null,
          days: byDay(views.filter((view) => view.categoryId === category.id)),
        }))

  return (
    <>
      <PublicBoard
        name={championship.name}
        subtitle={`${datesText(championship)} · ${CHAMPIONSHIP_STATUS_LABELS[championship.status]}`}
        categories={categories}
        shareText={championshipShareText(championship.name, `${getSiteUrl()}/c/${data.code}`)}
        tvHref={`/c/${data.code}/tv`}
      />
      <AutoRefresh seconds={15} />
    </>
  )
}
