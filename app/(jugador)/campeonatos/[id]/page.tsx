import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePlayer } from '@/lib/auth/viewer'
import { reportChampionshipTransfer, registerPair, saveUnavailability, withdrawEntry } from '@/lib/actions/championships'
import { loadChampionship, loadMemberDirectory } from '@/lib/data/championships'
import { championshipPosterUrl } from '@/lib/domain/championship-poster'
import {
  categoryDetail,
  matchRulesText,
  championshipBlocks,
  CHAMPIONSHIP_STATUS_LABELS,
  closesText,
  entryStateText,
  maxUnavailable,
  myEntries,
  openCategories,
  partnerOf,
  registerStatus,
  registrationOpen,
  spotsText,
  unavailabilityText,
  windowText,
} from '@/lib/domain/championships'
import { isUuid } from '@/lib/domain/input'
import { paymentMethodsNote } from '@/lib/domain/payments'
import { entryPaymentView } from '@/lib/domain/tournament-payments'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { ChampionshipBoard } from './championship-board'

export const metadata: Metadata = { title: 'Campeonato' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ categoria?: string }>

export default async function ChampionshipPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  // Without a session: sign in, the welcome form if needed, and back here (requirePlayer keeps the path).
  const viewer = await requirePlayer(`/campeonatos/${id}`)
  const { club } = viewer
  const [championship, members] = await Promise.all([loadChampionship(club, id), loadMemberDirectory(club)])
  if (!championship || championship.status === 'draft') notFound()

  const now = new Date()
  const { categoria } = await searchParams
  const open = registrationOpen(championship, now)
  const blocks = championshipBlocks(championship.windows)

  return (
    <ChampionshipBoard
      name={championship.name}
      statusLabel={CHAMPIONSHIP_STATUS_LABELS[championship.status]}
      cancelled={championship.status === 'cancelled'}
      dates={championship.windows.map(windowText)}
      closes={championship.status === 'registration' ? closesText(championship, club.timezone) : null}
      rules={championship.rules}
      posterUrl={championshipPosterUrl(getSupabaseEnv().url, championship.posterPath)}
      paymentNote={paymentMethodsNote(club)}
      categories={openCategories(championship).map((category) => {
        const status = registerStatus(championship, category, viewer.userId, now)
        return {
          id: category.id,
          name: category.name,
          detail: categoryDetail(category),
          playRules: matchRulesText(category),
          spots: spotsText(category),
          full: status.ok && status.full,
          available: status.ok,
          reason: status.ok ? null : status.reason,
        }
      })}
      entries={myEntries(championship, viewer.userId).map(({ entry, category }) => ({
        entryId: entry.id,
        categoryName: category.name,
        partnerName: partnerOf(entry, viewer.userId).name,
        stateText: entryStateText(category, entry),
        waiting: entry.status === 'waiting',
        payment:
          entry.status === 'active' && category.price > 0
            ? entryPaymentView(category.price, entry.payments, club.accepts_transfer)
            : null,
        hoursText: unavailabilityText(entry.unavailable.length),
        canWithdraw: open,
        canEditHours: open,
        unavailable: entry.unavailable,
        note: entry.unavailabilityNote,
      }))}
      blocks={blocks}
      maxUnavailable={maxUnavailable(blocks.length)}
      members={members}
      myLevel={viewer.membership.category}
      viewerId={viewer.userId}
      transfer={{ details: club.transfer_details, receiptRequired: club.transfer_receipt_required }}
      initialCategoryId={categoria && isUuid(categoria) ? categoria : null}
      actions={{ register: registerPair, withdraw: withdrawEntry, hours: saveUnavailability, report: reportChampionshipTransfer }}
    />
  )
}
