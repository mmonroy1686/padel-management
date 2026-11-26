'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FormAction } from '@/components/ui/action-form'
import { buttonClasses } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { IDLE } from '@/lib/actions/result'

// How long "Deshacer" stays after a charge.
export const UNDO_MS = 10_000

export type ChargeUndo = {
  // The payments the charge made; voided one by one (void_desk_payment).
  paymentIds: string[]
  action: FormAction
  // "Deshacer el cobro a Paula": what a screen reader hears.
  label: string
}

// What a charge at the desk says, where reception is looking: a bar fixed at the bottom of the screen (above the
// phone's bottom bar), not at the top of a long list the charged row scrolled away from. "Deshacer" stays for ten
// seconds (a cash charge picked as POS, the wrong person); the message stays until it is closed or replaced.
export function ChargeReceipt({
  message,
  tone = 'ok',
  undo,
  onDismiss,
  onUndone,
}: {
  message: string
  tone?: 'ok' | 'error'
  undo?: ChargeUndo | null
  onDismiss: () => void
  onUndone: (message: string) => void
}) {
  const [undoOpen, setUndoOpen] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => setUndoOpen(false), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const run = async () => {
    if (!undo) return
    setPending(true)
    setError(null)
    let last = ''
    for (const paymentId of undo.paymentIds) {
      const data = new FormData()
      data.set('paymentId', paymentId)
      const result = await undo.action(IDLE, data)
      if (result?.status === 'error') {
        setPending(false)
        setError(result.message ?? 'No pudimos deshacer el cobro.')
        return
      }
      last = result?.message ?? last
    }
    setPending(false)
    onUndone(undo.paymentIds.length === 1 ? last : `Cobros anulados (${undo.paymentIds.length}).`)
  }

  const canUndo = Boolean(undo && undo.paymentIds.length > 0 && undoOpen)
  return (
    <div className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-xl md:bottom-6">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-lg">
        <Icon name={tone === 'error' ? 'alert' : 'check-circle'} className={tone === 'error' ? 'text-danger' : 'text-court-ink'} />
        <p role={tone === 'error' ? 'alert' : 'status'} className="min-w-0 flex-1 text-sm font-semibold">
          {error ?? message}
        </p>
        {canUndo && undo ? (
          <button
            type="button"
            aria-label={undo.label}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={run}
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            {pending ? 'Deshaciendo…' : 'Deshacer'}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Cerrar el aviso"
          onClick={onDismiss}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-muted hover:bg-bg"
        >
          <Icon name="x" />
        </button>
      </div>
    </div>
  )
}

type Receipt = { id: number; message: string; tone: 'ok' | 'error'; undo: ChargeUndo | null }
type ReceiptApi = { show: (message: string, tone: 'ok' | 'error', undo: ChargeUndo | null) => void }

const ReceiptContext = createContext<ReceiptApi | null>(null)

// A screen whose rows can disappear once charged (Inicio: a paid turn leaves its section) keeps the receipt above
// them, so it outlives the row that made it. Without a provider (the Grilla's sheet) a charge shows its own notice.
export function ChargeReceiptProvider({ children }: { children: ReactNode }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const api = useMemo<ReceiptApi>(
    () => ({ show: (message, tone, undo) => setReceipt((current) => ({ id: (current?.id ?? 0) + 1, message, tone, undo })) }),
    [],
  )
  return (
    <ReceiptContext.Provider value={api}>
      {children}
      {receipt ? (
        <ChargeReceipt
          key={receipt.id}
          message={receipt.message}
          tone={receipt.tone}
          undo={receipt.undo}
          onDismiss={() => setReceipt(null)}
          onUndone={(message) => api.show(message, 'ok', null)}
        />
      ) : null}
    </ReceiptContext.Provider>
  )
}

export function useChargeReceipt(): ReceiptApi | null {
  return useContext(ReceiptContext)
}
