'use client'

import { useCallback, useEffect, useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/domain/format'
import { countdownText } from '@/lib/domain/waitlist'

export type HoldBannerProps = {
  holdId: string
  // "Se liberó la Cancha 2, sáb 3 a las 19:00." (holdText)
  text: string
  expiresAt: string
  price: number | null
  paymentNote: string
  claimAction: FormAction
  declineAction: FormAction
}

// Design: "Inicio", on top while a slot is held for the player: what was freed, the time left, and
// "Reservar" (price and how to pay first) or "No me sirve".
export function HoldBanner({ holdId, text, expiresAt, price, paymentNote, claimAction, declineAction }: HoldBannerProps) {
  const expires = new Date(expiresAt)
  // The clock starts once mounted: the server's second and the browser's never match.
  const [now, setNow] = useState<Date | null>(null)
  const [confirming, setConfirming] = useState(false)
  // Stable, so the sheet does not grab the focus again on every tick.
  const closeSheet = useCallback(() => setConfirming(false), [])

  useEffect(() => {
    const tick = () => setNow(new Date())
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [])

  const over = now !== null && now.getTime() >= expires.getTime()

  return (
    <section aria-label="Turno retenido" className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-surface p-4">
      <p className="font-semibold">{text}</p>
      {over ? (
        <p>Se terminó el tiempo: el turno pasó al siguiente de la lista.</p>
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            Te la guardamos
            <span data-testid="hold-countdown" className="font-display text-3xl font-bold tabular-nums">
              {now ? countdownText(expires, now) : '--:--'}
            </span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button fullWidth onClick={() => setConfirming(true)}>
              Reservar
            </Button>
            <ActionForm action={declineAction} submitLabel="No me sirve" pendingLabel="Pasando…" variant="secondary">
              <input type="hidden" name="holdId" value={holdId} />
            </ActionForm>
          </div>
        </>
      )}
      <BottomSheet open={confirming && !over} onClose={closeSheet} title="Reservar turno">
        <div className="flex flex-col gap-4">
          <p>{text}</p>
          {price !== null ? <p className="font-display text-3xl font-bold">{formatPrice(price)}</p> : null}
          <p>{paymentNote}</p>
          <ActionForm action={claimAction} submitLabel="Confirmar reserva" pendingLabel="Reservando…" onDone={closeSheet}>
            <input type="hidden" name="holdId" value={holdId} />
          </ActionForm>
        </div>
      </BottomSheet>
    </section>
  )
}
