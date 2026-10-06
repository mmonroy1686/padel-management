import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AutoRefresh } from '@/components/live/auto-refresh'
import { loadPublicChampionship } from '@/lib/data/championship-fixture'
import { isPublicCode } from '@/lib/domain/championship-public'
import { brackets, dayBoard, matchViews } from '@/lib/domain/championship-views'
import { localDateOf } from '@/lib/domain/time'
import { TvBoard, type TvScreen } from './tv-board'

export const metadata: Metadata = { title: 'Modo TV' }

type Params = Promise<{ code: string }>

// For the club's screen: no session, renders again every 15 seconds (the board keeps its turn).
export default async function ChampionshipTvPage({ params }: { params: Params }) {
  const { code } = await params
  if (!isPublicCode(code)) notFound()
  const data = await loadPublicChampionship(code)
  if (!data) notFound()

  const views = matchViews(data.championship, data.fixture, {
    timezone: data.timezone,
    today: localDateOf(new Date(), data.timezone),
    courtName: new Map(data.courts.map((court) => [court.id, court.name])),
  })
  const board = dayBoard(views, 8)
  const screens: TvScreen[] = [
    { key: 'playing', title: 'En juego ahora', matches: board.playing },
    { key: 'upcoming', title: 'Próximos', matches: board.upcoming },
    ...brackets(data.championship, views).map((bracket) => ({
      key: bracket.categoryId,
      title: `Llave · ${bracket.categoryName}`,
      bracket,
    })),
  ]
  return (
    <>
      <TvBoard name={data.championship.name} screens={screens} />
      <AutoRefresh seconds={15} />
    </>
  )
}
