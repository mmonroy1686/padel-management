import { PaymentBadge } from '@/components/booking/payment-badge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice } from '@/lib/domain/format'
import { entryPaymentView } from '@/lib/domain/tournament-payments'
import type { Tournament } from '@/lib/domain/tournaments'

export type EntryActions = { cash: FormAction; remove: FormAction; addGuest: FormAction }

const COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Jugador', sortable: true },
  { key: 'payment', label: 'Pago', sortable: true },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

// Design: "Gestión". Who is in and whether each one paid, as a table; until it starts, reception takes people
// out and adds guests. Cash for whoever owes, as long as no transfer is waiting for review.
export function EntriesManager({ tournament, acceptsCash, actions }: { tournament: Tournament; acceptsCash: boolean; actions: EntryActions }) {
  const editable = tournament.status === 'registration' || tournament.status === 'closed'
  const full = tournament.entries.length >= tournament.maxPlayers
  const rows: DataRow[] = tournament.entries.map((entry) => {
    const payment = entryPaymentView(tournament.price, entry.payments, false)
    return {
      id: entry.id,
      search: entry.name,
      sort: { name: entry.name, payment: payment.state },
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
            {acceptsCash && payment.state === 'pending' && tournament.status !== 'cancelled' ? (
              <ActionForm action={actions.cash} submitLabel={`Cobrar ${formatPrice(payment.due)}`} pendingLabel="Registrando…" variant="secondary">
                <input type="hidden" name="entryId" value={entry.id} />
                <input type="hidden" name="amount" value={payment.due} />
              </ActionForm>
            ) : null}
          </span>
        ),
        actions: editable ? (
          <ActionForm action={actions.remove} submitLabel="Sacar del torneo" pendingLabel="Sacando…" variant="ghost">
            <input type="hidden" name="entryId" value={entry.id} />
          </ActionForm>
        ) : null,
      },
    }
  })

  return (
    <section aria-labelledby="anotados" className="flex flex-col gap-3">
      <h2 id="anotados" className="font-display text-2xl font-bold uppercase">
        Anotados ({tournament.entries.length} de {tournament.maxPlayers})
      </h2>
      <DataTable
        caption="Anotados"
        columns={COLUMNS}
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
        </ActionForm>
      ) : null}
    </section>
  )
}
