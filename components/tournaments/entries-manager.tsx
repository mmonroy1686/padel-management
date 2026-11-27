import { PaymentBadge } from '@/components/booking/payment-badge'
import { DeskCharge } from '@/components/club/desk-charge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice } from '@/lib/domain/format'
import type { DeskMethod } from '@/lib/domain/payments'
import { entryPaymentView } from '@/lib/domain/tournament-payments'
import { partnerOf, tournamentPairs, type Tournament, type TournamentEntry } from '@/lib/domain/tournaments'

export type EntryActions = { cash: FormAction; remove: FormAction; addGuest: FormAction; pair?: FormAction; split?: FormAction }

const COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Jugador', sortable: true },
  { key: 'payment', label: 'Pago', sortable: true },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]
// With fixed pairs, who each one plays with.
const PAIR_COLUMNS: DataColumn[] = [COLUMNS[0], { key: 'pair', label: 'Pareja', sortable: true }, ...COLUMNS.slice(1)]

// Design: "Gestión". Who is in and whether each one paid, as a table; until it starts, reception takes people
// out and adds guests. Cash for whoever owes, as long as no transfer is waiting for review.
export function EntriesManager({ tournament, deskMethods, actions }: { tournament: Tournament; deskMethods: DeskMethod[]; actions: EntryActions }) {
  const editable = tournament.status === 'registration' || tournament.status === 'closed'
  const full = tournament.entries.length >= tournament.maxPlayers
  const fixedPairs = tournament.format === 'fixed_pairs'
  const { seeking } = tournamentPairs(tournament)
  const rows: DataRow[] = tournament.entries.map((entry) => {
    const payment = entryPaymentView(tournament.price, entry.payments, false)
    return {
      id: entry.id,
      search: entry.name,
      sort: { name: entry.name, payment: payment.state, pair: partnerOf(tournament, entry)?.name ?? '' },
      filters: { payment: payment.state },
      cells: {
        name: (
          <span className="font-semibold">
            {entry.name}
            {entry.isGuest ? <span className="font-normal text-fg-muted"> (invitado)</span> : null}
          </span>
        ),
        payment: (
          <span className="flex flex-col items-start gap-2">
            <PaymentBadge state={payment.state} />
            {payment.state === 'pending' && tournament.status !== 'cancelled' ? (
              <DeskCharge
                action={actions.cash}
                methods={deskMethods}
                label={`Cobrar ${formatPrice(payment.due)}`}
                fields={{ entryId: entry.id, amount: payment.due }}
              />
            ) : null}
          </span>
        ),
        pair: fixedPairs ? (
          <PairCell tournament={tournament} entry={entry} seeking={seeking} editable={editable} actions={actions} />
        ) : null,
        actions: editable ? (
          <ActionForm action={actions.remove} submitLabel="Sacar del torneo" pendingLabel="Sacando…" variant="danger" size="sm" confirmLabel="¿Seguro? Tocá de nuevo">
            <input type="hidden" name="entryId" value={entry.id} />
          </ActionForm>
        ) : null,
      },
    }
  })

  return (
    <section aria-labelledby="anotados" className="flex flex-col gap-3">
      <h2 id="anotados" className="text-lg font-semibold">
        Anotados ({tournament.entries.length} de {tournament.maxPlayers})
      </h2>
      <DataTable
        caption="Anotados"
        columns={fixedPairs ? PAIR_COLUMNS : COLUMNS}
        rows={rows}
        searchLabel="Buscar jugador"
        filters={[
          {
            key: 'payment',
            label: 'Pago',
            options: [
              { value: 'pending', label: 'Pendiente de pago' },
              { value: 'reported', label: 'Transferencia informada' },
              { value: 'paid', label: 'Pagada' },
            ],
          },
        ]}
        emptyText="Todavía no se anotó nadie."
      />
      {editable && !full ? (
        <ActionForm action={actions.addGuest} submitLabel="Agregar invitado" pendingLabel="Agregando…" variant="secondary">
          <input type="hidden" name="tournamentId" value={tournament.id} />
          <Field label="Nombre del invitado" htmlFor="guestName">
            <input id="guestName" name="guestName" required maxLength={60} className={inputClasses} />
          </Field>
          {fixedPairs && seeking.length > 0 ? (
            <Field label="Pareja de" htmlFor="guestPartner">
              <select id="guestPartner" name="partnerEntryId" defaultValue="" className={inputClasses}>
                <option value="">Nadie todavía (busca pareja)</option>
                {seeking.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </ActionForm>
      ) : null}
    </section>
  )
}

// The partner, or «Busca pareja» with «Juntar con…» the others who look for one. Until it starts, pairs can be split.
function PairCell({
  tournament,
  entry,
  seeking,
  editable,
  actions,
}: {
  tournament: Tournament
  entry: TournamentEntry
  seeking: TournamentEntry[]
  editable: boolean
  actions: EntryActions
}) {
  const partner = partnerOf(tournament, entry)
  if (partner) {
    return (
      <span className="flex flex-col items-start gap-2">
        <span>{partner.name}</span>
        {editable && actions.split ? (
          <ActionForm action={actions.split} submitLabel="Separar" pendingLabel="Separando…" variant="ghost" size="sm" accessibleLabel={`Separar a ${entry.name} y ${partner.name}`}>
            <input type="hidden" name="entryId" value={entry.id} />
          </ActionForm>
        ) : null}
      </span>
    )
  }
  const others = seeking.filter((one) => one.id !== entry.id)
  return (
    <span className="flex flex-col items-start gap-2">
      <span className="font-semibold text-accent-ink">Busca pareja</span>
      {editable && actions.pair && others.length > 0 ? (
        <ActionForm action={actions.pair} submitLabel="Juntar" pendingLabel="Juntando…" variant="secondary" size="sm" accessibleLabel={`Juntar a ${entry.name}`}>
          <input type="hidden" name="entryId" value={entry.id} />
          <label className="sr-only" htmlFor={`pair-${entry.id}`}>
            Juntar a {entry.name} con
          </label>
          <select id={`pair-${entry.id}`} name="partnerEntryId" className={inputClasses}>
            {others.map((one) => (
              <option key={one.id} value={one.id}>
                Con {one.name}
              </option>
            ))}
          </select>
        </ActionForm>
      ) : null}
    </span>
  )
}
