'use client'

import { useState } from 'react'
import type { FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import { formatPrice } from '@/lib/domain/format'
import { TransferReviewCard, type TransferView } from './transfer-review-card'

export type TransferRow = TransferView & { at: number }

const COLUMNS: DataColumn[] = [
  { key: 'holder', label: 'Quién', sortable: true },
  { key: 'what', label: 'Qué', sortable: true },
  { key: 'when', label: 'Cuándo', sortable: true },
  { key: 'amount', label: 'Monto', sortable: true, align: 'end' },
  { key: 'receipt', label: 'Comprobante' },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

// Cobros: the transfers to confirm as a table; "Revisar" opens the receipt with confirm and reject.
export function TransfersTable({
  transfers,
  confirmAction,
  rejectAction,
}: {
  transfers: TransferRow[]
  confirmAction: FormAction
  rejectAction: FormAction
}) {
  const [reviewing, setReviewing] = useState<string | null>(null)
  const reviewed = transfers.find((transfer) => transfer.id === reviewing) ?? null

  const rows: DataRow[] = transfers.map((transfer) => ({
    id: transfer.id,
    search: `${transfer.holder} ${transfer.courtName}`,
    sort: { holder: transfer.holder, what: transfer.courtName, when: transfer.at, amount: transfer.amount },
    cells: {
      holder: <span className="font-semibold">{transfer.holder}</span>,
      what: transfer.courtName,
      when: transfer.when,
      amount: <span className="font-display text-xl font-bold tabular-nums">{formatPrice(transfer.amount)}</span>,
      receipt: transfer.receiptUrl ? (
        <a
          href={transfer.receiptUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Ver comprobante de ${transfer.holder}`}
          className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline"
        >
          Ver
        </a>
      ) : (
        <span className="text-fg-muted">Sin comprobante</span>
      ),
      actions: (
        <button
          type="button"
          aria-label={`Revisar la transferencia de ${transfer.holder}`}
          onClick={() => setReviewing(transfer.id)}
          className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-on-accent hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Revisar
        </button>
      ),
    },
  }))

  return (
    <>
      <DataTable
        caption="Transferencias para confirmar"
        columns={COLUMNS}
        rows={rows}
        searchLabel="Buscar por nombre"
        initialSort={{ key: 'when', dir: 'asc' }}
        emptyText="No hay transferencias para confirmar."
      />
      <BottomSheet open={reviewed !== null} onClose={() => setReviewing(null)} title={reviewed ? `Transferencia de ${reviewed.holder}` : ''}>
        {reviewed ? (
          <TransferReviewCard key={reviewed.id} transfer={reviewed} confirmAction={confirmAction} rejectAction={rejectAction} />
        ) : null}
      </BottomSheet>
    </>
  )
}
