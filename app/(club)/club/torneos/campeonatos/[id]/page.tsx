import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BracketView } from '@/components/championships/bracket-view'
import { FixtureSteps } from '@/components/championships/fixture-steps'
import { FixtureTable } from '@/components/championships/fixture-table'
import { GroupOrderForm } from '@/components/championships/group-order-form'
import { MatchDayBoard } from '@/components/championships/match-day-board'
import { MoveMatchSheet } from '@/components/championships/move-match-sheet'
import { SeedsForm } from '@/components/championships/seeds-form'
import { UnplacedList } from '@/components/championships/unplaced-list'
import { ZonesView } from '@/components/championships/zones-view'
import { LiveOccupancy } from '@/components/live/live-occupancy'
import { buttonClasses } from '@/components/ui/button'
import { ShareButton } from '@/components/ui/share-button'
import { getSiteUrl } from '@/lib/auth/redirect'
import { loadFixture } from '@/lib/data/championship-fixture'
import { EMPTY_FIXTURE } from '@/lib/domain/championship-fixture'
import { scheduleInput, slotOptions, unplacedReasons } from '@/lib/domain/championship-schedule'
import {
  brackets,
  championshipShareText,
  dayBoard,
  finishable,
  matchViews,
  seedPairs,
  zoneViews,
} from '@/lib/domain/championship-views'
import {
  closeGroup,
  drawFixture,
  finishFixture,
  moveMatch,
  pinMatch,
  publishFixture,
  recordResult,
  recordWalkover,
  saveSeeds,
  scheduleFixture,
  scoreGame,
  startMatch,
  undoGame,
} from '../fixture-actions'
import { PlayerSearch } from '@/components/championships/player-search'
import { TabLinks } from '@/components/ui/tab-links'
import { pairCards } from '@/lib/domain/championship-search'
import { championshipTabs, pickTab, TAB_LABELS } from '@/lib/domain/championship-tabs'
import { CategoriesEditor } from '@/components/championships/categories-editor'
import { ChampionshipControls } from '@/components/championships/championship-controls'
import { ChampionshipDetailsForm } from '@/components/championships/championship-details-form'
import { PairsBoard } from '@/components/championships/pairs-board'
import { PosterForm } from '@/components/championships/poster-form'
import { SmallCategories } from '@/components/championships/small-categories'
import { WindowsEditor } from '@/components/championships/windows-editor'
import { BackLink } from '@/components/ui/back-link'
import { Card } from '@/components/ui/card'
import { saveUnavailability } from '@/lib/actions/championships'
import { requireStaff } from '@/lib/auth/viewer'
import { loadChampionship, loadChampionshipPhones } from '@/lib/data/championships'
import { loadMemberOptions } from '@/lib/data/members'
import { loadActiveCourts } from '@/lib/data/tournaments'
import { pairsCategories } from '@/lib/domain/championship-pairs'
import { championshipPosterUrl } from '@/lib/domain/championship-poster'
import {
  activeEntries,
  categoryDetail,
  matchRulesText,
  CHAMPIONSHIP_STATUS_LABELS,
  championshipBlocks,
  championshipReadiness,
  closesText,
  datesText,
  openCategories,
  smallCategories,
  smallCategoryText,
  windowText,
} from '@/lib/domain/championships'
import { dayLabel, timeIn } from '@/lib/domain/format'
import { isUuid } from '@/lib/domain/input'
import { TIME_OPTIONS } from '@/lib/domain/settings'
import { localDateOf, parseTime } from '@/lib/domain/time'
import { courtsText } from '@/lib/domain/tournaments'
import { getSupabaseEnv } from '@/lib/supabase/env'
import {
  addCategory,
  addPair,
  cancelCategory,
  addWindow,
  cancelChampionship,
  closeRegistration,
  deleteCategory,
  deleteWindow,
  mergeCategory,
  movePair,
  openRegistration,
  recordChampionshipCash,
  removeChampionshipPoster,
  removePair,
  saveChampionshipPoster,
  updateChampionship,
} from '../actions'

export const metadata: Metadata = { title: 'Campeonato' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ partido?: string; ver?: string; categoria?: string }>

// The organizer's page of a championship, in tabs (?ver=hoy|fixture|zonas|parejas|ajustes): without one, or with
// one that does not fit the state, the tab its state calls for. The header stays on every tab: name, state, the
// next step, "Compartir", "Abrir modo TV" and "Buscar jugador". ?partido=<id> opens "Mover partido" on Fixture;
// ?categoria=<id> picks the category of "Zonas y llaves".
export default async function ManageChampionshipPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { id } = await params
  const { partido, ver, categoria } = await searchParams
  if (!isUuid(id)) notFound()
  const viewer = await requireStaff(`/club/torneos/campeonatos/${id}`)
  const { club } = viewer
  const [championship, courts, phones, members] = await Promise.all([
    loadChampionship(club, id),
    loadActiveCourts(club),
    loadChampionshipPhones(id),
    loadMemberOptions(club.id),
  ])
  if (!championship) notFound()

  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const courtName = new Map(courts.map((court) => [court.id, court.name]))
  const opens = parseTime(club.opens_at)
  const closes = parseTime(club.closes_at)
  const draft = championship.status === 'draft'
  const editable = championship.status !== 'finished' && championship.status !== 'cancelled'
  const closesAt = championship.registrationClosesAt
  const deadline = championship.status === 'registration' ? closesText(championship, club.timezone) : null
  const showsFixture = ['drawn', 'published', 'in_progress', 'finished'].includes(championship.status)
  const fixture = showsFixture ? await loadFixture(championship.id) : EMPTY_FIXTURE
  const views = matchViews(championship, fixture, { timezone: club.timezone, today, courtName })
  const board = dayBoard(views)
  const live = championship.status === 'published' || championship.status === 'in_progress'
  const movable = championship.status === 'drawn' || live
  const input = movable ? scheduleInput(championship, fixture, club.timezone) : null
  const pagePath = `/club/torneos/campeonatos/${championship.id}`
  const unplaced =
    championship.status === 'drawn' && input
      ? unplacedReasons(input).map((item) => {
          const view = views.find((match) => match.id === item.matchId)
          return {
            id: item.matchId,
            title: view ? `${view.categoryName} · ${view.name}: ${view.sideA} vs ${view.sideB}` : 'Partido',
            reason: item.reason,
            href: `${pagePath}?partido=${item.matchId}`,
          }
        })
      : []
  const moving =
    input && partido ? (views.find((match) => match.id === partido && match.status === 'scheduled') ?? null) : null
  const moveOptions =
    moving && input
      ? slotOptions(input, moving.id).map((option) => ({
          value: `${option.courtId}|${option.startsAt.toISOString()}`,
          label: `${dayLabel(localDateOf(option.startsAt, club.timezone), today)} ${timeIn(option.startsAt, club.timezone)} · ${courtName.get(option.courtId) ?? 'Cancha'}`,
        }))
      : []
  const rules = Object.fromEntries(
    championship.categories.map((category) => [category.id, { thirdSet: category.thirdSet, timeLimit: category.timeLimit }]),
  )
  const shareUrl = championship.publicCode ? `${getSiteUrl()}/c/${championship.publicCode}` : null
  const tab = pickTab(championship.status, partido ? 'fixture' : ver)
  const zones = zoneViews(championship, fixture)
  const allBrackets = brackets(championship, views)
  const pairs = pairsCategories(championship, phones)
  const cards = pairCards({ championship, fixture, views, zones }, pairs.flatMap((category) => category.rows))
  const zoneCategories = championship.categories.filter(
    (category) =>
      zones.some((zone) => zone.categoryId === category.id) ||
      allBrackets.some((bracket) => bracket.categoryId === category.id),
  )
  const zoneCategory = zoneCategories.find((category) => category.id === categoria) ?? zoneCategories[0] ?? null
  const controls = { open: openRegistration, close: closeRegistration, cancel: cancelChampionship }
  const steps = (
    <FixtureSteps
      championshipId={championship.id}
      status={championship.status}
      scheduled={fixture.matches.filter((match) => match.courtId !== null).length}
      unplaced={unplaced.length}
      finishable={finishable(fixture)}
      actions={{ draw: drawFixture, schedule: scheduleFixture, publish: publishFixture, finish: finishFixture }}
    />
  )

  return (
    <>
      <BackLink href="/club/torneos">Volver a torneos</BackLink>
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-display text-3xl font-bold uppercase">{championship.name}</h2>
            <span className="shrink-0 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
              {CHAMPIONSHIP_STATUS_LABELS[championship.status]}
            </span>
          </div>
          <p className="text-fg-muted">{datesText(championship)}</p>
          {deadline ? <p className="text-sm">Inscripción hasta el {deadline}.</p> : null}
        </div>
        <ChampionshipControls
          championshipId={championship.id}
          status={championship.status}
          readiness={championshipReadiness(championship)}
          actions={controls}
          part="steps"
        />
        {shareUrl ? (
          <div className="flex flex-wrap items-start gap-3">
            <ShareButton title={championship.name} text={championshipShareText(championship.name, shareUrl)} />
            <Link
              href={`/c/${championship.publicCode}/tv`}
              target="_blank"
              className={buttonClasses({ variant: 'secondary' })}
            >
              Abrir modo TV
            </Link>
          </div>
        ) : null}
        {cards.length > 0 ? (
          <PlayerSearch
            pairs={cards}
            cash={{ action: recordChampionshipCash, acceptsCash: club.accepts_cash && championship.status !== 'cancelled' }}
          />
        ) : null}
        <TabLinks
          label="Secciones del campeonato"
          current={tab}
          items={championshipTabs(championship.status).map((key) => ({
            key,
            label: TAB_LABELS[key],
            href: `${pagePath}?ver=${key}`,
          }))}
        />
      </header>

      {tab === 'hoy' ? (
        <section aria-labelledby="dia" className="flex flex-col gap-3">
          <h2 id="dia" className="font-display text-2xl font-bold uppercase">
            Día del torneo
          </h2>
          {steps}
          <MatchDayBoard
            championshipId={championship.id}
            playing={board.playing}
            upcoming={board.upcoming}
            finished={board.finished}
            rules={rules}
            actions={{
              start: startMatch,
              result: recordResult,
              walkover: recordWalkover,
              score: scoreGame,
              undo: undoGame,
            }}
          />
        </section>
      ) : null}

      {tab === 'fixture' ? (
        <>
          {championship.status === 'closed' ? (
            <section aria-labelledby="cabezas" className="flex flex-col gap-3">
              <h2 id="cabezas" className="font-display text-2xl font-bold uppercase">
                Cabezas de serie
              </h2>
              <p className="text-sm text-fg-muted">
                Las parejas van por la suma de las categorías que declararon (menor primero). Numerá las que quieras
                fijar: van una por zona.
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {openCategories(championship)
                  .filter((category) => activeEntries(category).length >= 2)
                  .map((category) => (
                    <Card key={category.id} className="flex flex-col gap-2">
                      <h3 className="font-display text-xl font-bold uppercase">{category.name}</h3>
                      <SeedsForm categoryId={category.id} pairs={seedPairs(category)} action={saveSeeds} />
                    </Card>
                  ))}
              </div>
            </section>
          ) : null}
          {steps}
          {showsFixture ? (
            <section aria-labelledby="fixture" className="flex flex-col gap-3">
              <h2 id="fixture" className="font-display text-2xl font-bold uppercase">
                Fixture
              </h2>
              {unplaced.length > 0 ? <UnplacedList items={unplaced} /> : null}
              <FixtureTable
                matches={views}
                basePath={pagePath}
                editable={movable}
                canPin={championship.status === 'drawn'}
                pinAction={pinMatch}
              />
            </section>
          ) : null}
        </>
      ) : null}

      {tab === 'zonas' ? (
        <section aria-labelledby="zonas" className="flex flex-col gap-3">
          <h2 id="zonas" className="font-display text-2xl font-bold uppercase">
            Zonas y llaves
          </h2>
          {zoneCategories.length > 1 ? (
            <TabLinks
              label="Categorías"
              current={zoneCategory?.id ?? ''}
              items={zoneCategories.map((category) => ({
                key: category.id,
                label: category.name,
                href: `${pagePath}?ver=zonas&categoria=${category.id}`,
              }))}
            />
          ) : null}
          {zoneCategory ? (
            <>
              <ZonesView
                zones={zones.filter((zone) => zone.categoryId === zoneCategory.id)}
                footer={(zone) =>
                  live && zone.needsOrder ? (
                    <GroupOrderForm
                      groupId={zone.id}
                      rows={zone.rows.map((row) => ({ entryId: row.entryId, name: row.name }))}
                      tiedNames={zone.tiedNames}
                      action={closeGroup}
                    />
                  ) : null
                }
              />
              {allBrackets
                .filter((bracket) => bracket.categoryId === zoneCategory.id)
                .map((bracket) => (
                  <BracketView key={bracket.categoryId} bracket={bracket} />
                ))}
            </>
          ) : (
            <p className="text-fg-muted">Todavía no hay zonas ni llaves.</p>
          )}
        </section>
      ) : null}

      {tab === 'parejas' ? (
        <>
          {championship.status === 'closed' && smallCategories(championship).length > 0 ? (
            <SmallCategories
              categories={smallCategories(championship).map((category) => ({
                id: category.id,
                name: category.name,
                text: smallCategoryText(category),
              }))}
              targets={openCategories(championship).map((category) => ({ id: category.id, name: category.name }))}
              actions={{ merge: mergeCategory, cancel: cancelCategory }}
            />
          ) : null}
          <PairsBoard
            categories={pairs}
            editable={championship.status === 'registration' || championship.status === 'closed'}
            acceptsCash={club.accepts_cash && championship.status !== 'cancelled'}
            members={members}
            blocks={championshipBlocks(championship.windows)}
            actions={{ cash: recordChampionshipCash, remove: removePair, move: movePair, add: addPair, hours: saveUnavailability }}
          />
        </>
      ) : null}

      {tab === 'ajustes' ? (
        <>
          {draft ? (
            <>
              <WindowsEditor
                championshipId={championship.id}
                windows={championship.windows.map((window) => ({
                  id: window.id,
                  text: windowText(window),
                  courts: courtsText(window.courtIds.map((courtId) => courtName.get(courtId) ?? 'Cancha')),
                }))}
                courts={courts}
                fromTimes={TIME_OPTIONS.filter((time) => parseTime(time) >= opens && parseTime(time) < closes)}
                toTimes={TIME_OPTIONS.filter((time) => parseTime(time) > opens && parseTime(time) <= closes)}
                today={today}
                addAction={addWindow}
                deleteAction={deleteWindow}
              />
              <CategoriesEditor
                championshipId={championship.id}
                categories={openCategories(championship).map((category) => ({
                  id: category.id,
                  name: category.name,
                  detail: `${categoryDetail(category)} · ${matchRulesText(category)}`,
                }))}
                addAction={addCategory}
                deleteAction={deleteCategory}
              />
            </>
          ) : null}
          {editable ? (
            <section aria-labelledby="datos" className="flex flex-col gap-3">
              <h2 id="datos" className="font-display text-2xl font-bold uppercase">
                Datos
              </h2>
              <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                  <ChampionshipDetailsForm
                    action={updateChampionship}
                    submitLabel="Guardar datos"
                    pendingLabel="Guardando…"
                    today={today}
                    details={{
                      id: championship.id,
                      name: championship.name,
                      rules: championship.rules,
                      maxCategories: championship.maxCategoriesPerPlayer,
                      closesDate: closesAt ? localDateOf(closesAt, club.timezone) : '',
                      closesTime: closesAt ? timeIn(closesAt, club.timezone) : '',
                    }}
                  />
                </Card>
                <Card>
                  <PosterForm
                    championshipId={championship.id}
                    clubId={club.id}
                    posterUrl={championshipPosterUrl(getSupabaseEnv().url, championship.posterPath)}
                    saveAction={saveChampionshipPoster}
                    removeAction={removeChampionshipPoster}
                  />
                </Card>
              </div>
            </section>
          ) : null}
          <div className="mt-4 border-t border-border pt-6">
            <ChampionshipControls
              championshipId={championship.id}
              status={championship.status}
              readiness={null}
              actions={controls}
              part="cancel"
            />
          </div>
        </>
      ) : null}

      {moving ? (
        <MoveMatchSheet
          matchId={moving.id}
          title={`${moving.categoryName} · ${moving.name}: ${moving.sideA} vs ${moving.sideB}`}
          options={moveOptions}
          closeHref={`${pagePath}?ver=fixture`}
          action={moveMatch}
        />
      ) : null}
      <LiveOccupancy clubId={club.id} />
    </>
  )
}
