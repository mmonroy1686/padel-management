'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { FormAction } from '@/components/ui/action-form'
import { buttonClasses } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { IDLE } from '@/lib/actions/result'

// How long "Deshacer" stays after a charge: long enough for the mistake to show (the customer reaching for a card),
// Miguel's call on 26/11. After it, "Anular" in Cobrado hoy still takes a charge back.
export const UNDO_MS = 30_000

export type ChargeUndo = {
  // The payments the charge made, voided together or not at all (voidPayments → void_desk_payments).
  paymentIds: string[]
  // Takes every paymentId of the form at once.
  action: FormAction
  // "Deshacer el cobro a Paula": what a screen reader hears.
  label: string
}

// What a charge at the desk says, where reception is looking: a bar fixed at the bottom of the screen (above the
// phone's bottom bar), not at the top of a long list the charged row scrolled away from. "Deshacer" stays for thirty
// seconds (a cash charge picked as POS, the wrong person); then a good outcome goes away (an error stays until closed).
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
  // When "Deshacer" ends, a good outcome goes away on its own (it would cover the next rows); an error stays.
  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  })
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setUndoOpen(false)
      if (tone === 'ok') dismiss.current()
    }, UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [tone])

  const run = async () => {
    if (!undo) return
    setPending(true)
    setError(null)
    const data = new FormData()
    for (const paymentId of undo.paymentIds) data.append('paymentId', paymentId)
    const result = await undo.action(IDLE, data)
    setPending(false)
    // All or nothing: a failure leaves every payment charged, and says so.
    if (result?.status === 'error') setError(`No pudimos deshacer: ${result.message ?? 'el cobro sigue hecho'}. El cobro sigue hecho.`)
    else onUndone(result?.message ?? 'Cobro anulado.')
  }

  const canUndo = Boolean(undo && undo.paymentIds.length > 0 && undoOpen)
  return (
    <>
      {/* Room at the end of the page while the bar shows, so the last rows can scroll above it. */}
      <div aria-hidden className="h-24" />
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
    </>
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
