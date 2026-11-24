'use client'

import { PaymentBadge } from '@/components/booking/payment-badge'
import { MatchLine } from '@/components/championships/match-line'
import { ZonesView } from '@/components/championships/zones-view'
import { DeskCharge } from '@/components/club/desk-charge'
import type { FormAction } from '@/components/ui/action-form'
import type { PairCard } from '@/lib/domain/championship-search'
import { formatPrice } from '@/lib/domain/format'
import type { DeskMethod } from '@/lib/domain/payments'

export type CashOption = { action: FormAction; methods: DeskMethod[] }

// Design: "la ficha": the pair, its category and situation; its matches (in play, next with day, time and court,
// played with their score); its group with its row highlighted; where it is in the bracket. The club's card adds
// the payment with "Cobrar", the hours it cannot play and the phones.
export function PairCardView({ card, cash }: { card: PairCard; cash?: CashOption }) {
  const sections = [
    { title: 'En juego ahora', matches: card.live },
    { title: 'Próximos', matches: card.upcoming },
    { title: 'Jugados', matches: card.played },
  ].filter((section) => section.matches.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-fg-muted">{card.categoryName}</span>
        <span className="rounded-full border border-accent px-2.5 py-0.5 text-sm font-semibold">{card.situation}</span>
      </p>
      {card.bracket ? (
        <section aria-label="En la llave" className="flex flex-col gap-1">
          <p className="font-semibold">{`${card.bracket.match} contra ${card.bracket.rival}`}</p>
          {card.bracket.next ? <p className="text-sm text-fg-muted">{card.bracket.next}</p> : null}
        </section>
      ) : null}
      {sections.map((section) => (
        <section key={section.title} aria-label={section.title} className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-fg-muted">{section.title}</h3>
          <ul className="flex flex-col gap-2">
            {section.matches.map((match) => (
              <li key={match.id} className="rounded-2xl border border-border bg-bg p-3">
                <MatchLine match={match} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {card.zone ? <ZonesView zones={[card.zone]} highlight={card.entryId} /> : null}
      {card.private ? (
        <section aria-label="Datos del club" className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="flex items-center gap-2">
            Pago <PaymentBadge state={card.private.paymentState} />
          </p>
          {cash && card.private.charge !== null ? (
            <DeskCharge
              action={cash.action}
              methods={cash.methods}
              label={`Cobrar ${formatPrice(card.private.charge)}`}
              fields={{ entryId: card.entryId, amount: card.private.charge }}
            />
          ) : null}
          <p className="text-sm">{card.private.hoursText}</p>
          {card.private.phones ? <p className="text-sm">{`Teléfonos: ${card.private.phones}`}</p> : null}
        </section>
      ) : null}
    </div>
  )
}
