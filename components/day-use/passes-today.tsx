'use client'

import { useCallback, useState } from 'react'
import { PaymentBadge } from '@/components/booking/payment-badge'
import type { FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import { PASS_STATUS_LABELS, type DayUsePass, type PassStatus } from '@/lib/domain/day-use'
import { timeIn } from '@/lib/domain/format'
import { entryPaymentView } from '@/lib/domain/tournament-payments'
import type { MemberOption } from '@/lib/domain/members'
import type { LocalDate } from '@/lib/domain/time'
import { PassStaffCard, type PassActions } from './pass-staff-card'
import { SellSheet, type SellOffer } from './sell-sheet'

const COLUMNS: DataColumn[] = [
  { key: 'holder', label: 'Quién', sortable: true },
  { key: 'code', label: 'Código', sortable: true },
  { key: 'product', label: 'Pase', sortable: true },
  { key: 'status', label: 'Estado', sortable: true },
  { key: 'payment', label: 'Pago' },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

// Design: "Hoy". The passes of a day (today unless reception picks another) in a table with a search
// by name or code and a status filter; "Gestionar" opens the pass with its actions. And the sale at
// the desk.
export function PassesToday({
  passes,
  today,
  forDay = 'de hoy',
  timezone,
  acceptsCash,
  actions,
  sell,
}: {
  passes: DayUsePass[]
  today: LocalDate
  // "de hoy", "del viernes 2": what the title and the empty list say.
  forDay?: string
  timezone: string
  acceptsCash: boolean
  actions: PassActions
  sell: { offers: SellOffer[]; members: MemberOption[]; rewardPercent: number | null; action: FormAction }
}) {
  const [selling, setSelling] = useState(false)
  const [managing, setManaging] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const done = useCallback((message: string) => {
    setSelling(false)
    setManaging(null)
    setNotice(message)
  }, [])
  const managed = passes.find((pass) => pass.id === managing) ?? null

  const rows: DataRow[] = passes.map((pass) => {
    const payment = entryPaymentView(pass.total, pass.payments, false)
    return {
      id: pass.id,
      search: `${pass.holder} ${pass.code}`,
      sort: { holder: pass.holder, code: pass.code, product: pass.productName, status: PASS_STATUS_LABELS[pass.status] },
      filters: { status: pass.status },
      cells: {
        holder: (
          <span className="font-semibold">
            {pass.holder}
            {pass.isGuest ? <span className="font-normal text-fg-muted"> (sin cuenta)</span> : null}
          </span>
        ),
        code: <span className="tabular-nums">{pass.code}</span>,
        product: (
          <span className="flex flex-col">
            <span>{pass.productName}</span>
            <span className="text-sm text-fg-muted tabular-nums">
              {timeIn(pass.startsAt, timezone)} a {timeIn(pass.endsAt, timezone)}
            </span>
          </span>
        ),
        status: PASS_STATUS_LABELS[pass.status],
        payment: pass.total > 0 && pass.status !== 'cancelled' ? <PaymentBadge state={payment.state} /> : <span className="text-fg-muted">—</span>,
        actions: (
          <button
            type="button"
            aria-label={`Gestionar el pase de ${pass.holder}`}
            onClick={() => setManaging(pass.id)}
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            Gestionar
          </button>
        ),
      },
    }
  })

  return (
    <section aria-labelledby="pases-hoy" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pases-hoy" className="font-display text-2xl font-bold uppercase">
          Pases {forDay} ({passes.length})
        </h2>
        <Button onClick={() => setSelling(true)}>Vender pase</Button>
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      <DataTable
        caption={`Pases ${forDay}`}
        columns={COLUMNS}
        rows={rows}
        searchLabel="Buscar por nombre o código"
        searchPlaceholder="Ej: Rodríguez o DU-482193"
        filters={[
          {
            key: 'status',
            label: 'Estado',
            options: (Object.keys(PASS_STATUS_LABELS) as PassStatus[]).map((status) => ({ value: status, label: PASS_STATUS_LABELS[status] })),
          },
        ]}
        emptyText={`Todavía no hay pases ${forDay === 'de hoy' ? 'para hoy' : forDay}.`}
      />
      <BottomSheet open={managed !== null} onClose={() => setManaging(null)} title={managed?.holder ?? ''}>
        {managed ? (
          <PassStaffCard pass={managed} today={today} timezone={timezone} acceptsCash={acceptsCash} actions={actions} onDone={done} />
        ) : null}
      </BottomSheet>
      {selling ? (
        <SellSheet
          offers={sell.offers}
          members={sell.members}
          rewardPercent={sell.rewardPercent}
          action={sell.action}
          onClose={() => setSelling(false)}
          onDone={done}
        />
      ) : null}
    </section>
  )
}
