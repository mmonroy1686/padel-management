import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
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
import { timeIn } from '@/lib/domain/format'
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

// A draft is edited here (days of play and categories); from the opening of registration on, the same page
// manages the pairs.
export default async function ManageChampionshipPage({ params }: { params: Params }) {
  const { id } = await params
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

  return (
    <>
      <BackLink href="/club/torneos">Volver a torneos</BackLink>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-3xl font-bold uppercase">{championship.name}</h2>
          <span className="shrink-0 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
            {CHAMPIONSHIP_STATUS_LABELS[championship.status]}
          </span>
        </div>
        <p className="text-fg-muted">{datesText(championship)}</p>
        {deadline ? <p className="text-sm">Inscripción hasta el {deadline}.</p> : null}
      </header>

      <ChampionshipControls
        championshipId={championship.id}
        status={championship.status}
        readiness={championshipReadiness(championship)}
        actions={{ open: openRegistration, close: closeRegistration, cancel: cancelChampionship }}
      />

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
      {!draft ? (
        <PairsBoard
          categories={pairsCategories(championship, phones)}
          editable={championship.status === 'registration' || championship.status === 'closed'}
          acceptsCash={club.accepts_cash && championship.status !== 'cancelled'}
          members={members}
          blocks={championshipBlocks(championship.windows)}
          actions={{ cash: recordChampionshipCash, remove: removePair, move: movePair, add: addPair, hours: saveUnavailability }}
        />
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
    </>
  )
}
