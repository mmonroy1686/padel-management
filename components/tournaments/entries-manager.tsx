import { PaymentBadge } from '@/components/booking/payment-badge'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPrice } from '@/lib/domain/format'
import { entryPaymentView } from '@/lib/domain/tournament-payments'
import type { Tournament } from '@/lib/domain/tournaments'

export type EntryActions = { cash: FormAction; remove: FormAction; addGuest: FormAction }

// Design: "Gestión". Who is in and whether each one paid; until it starts, reception takes people
// out and adds guests. Cash for whoever owes, as long as no transfer is waiting for review.
export function EntriesManager({ tournament, acceptsCash, actions }: { tournament: Tournament; acceptsCash: boolean; actions: EntryActions }) {
  const editable = tournament.status === 'registration' || tournament.status === 'closed'
  const full = tournament.entries.length >= tournament.maxPlayers

  return (
    <section aria-labelledby="anotados" className="flex flex-col gap-3">
      <h2 id="anotados" className="font-display text-2xl font-bold uppercase">
        Anotados ({tournament.entries.length} de {tournament.maxPlayers})
      </h2>
      {tournament.entries.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {tournament.entries.map((entry) => {
            const payment = entryPaymentView(tournament.price, entry.payments, false)
            return (
              <li key={entry.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {entry.name}
                    {entry.isGuest ? <span className="font-normal text-fg-muted"> (invitado)</span> : null}
                  </span>
                  <PaymentBadge state={payment.state} />
                </div>
                {acceptsCash && payment.state === 'pending' && tournament.status !== 'cancelled' ? (
                  <ActionForm action={actions.cash} submitLabel={`Cobrar ${formatPrice(payment.due)}`} pendingLabel="Registrando…" variant="secondary">
                    <input type="hidden" name="entryId" value={entry.id} />
                    <input type="hidden" name="amount" value={payment.due} />
                  </ActionForm>
                ) : null}
                {editable ? (
                  <ActionForm action={actions.remove} submitLabel="Sacar del torneo" pendingLabel="Sacando…" variant="ghost">
                    <input type="hidden" name="entryId" value={entry.id} />
                  </ActionForm>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-fg-muted">Todavía no se anotó nadie.</p>
      )}
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
