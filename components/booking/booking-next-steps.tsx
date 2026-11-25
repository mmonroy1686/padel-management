'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Icon } from '@/components/ui/icon'

// Right after booking: how to pay, the club's transfer details to copy (so nobody has to come back for them), and
// where the booking is.
export function BookingNextSteps({ paymentNote, transferDetails }: { paymentNote: string; transferDetails: string | null }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!transferDetails) return
    try {
      await navigator.clipboard.writeText(transferDetails)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="notice-in flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <p className="font-semibold">{paymentNote}</p>
      {transferDetails ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-fg-muted">Para transferir:</p>
          <p className="whitespace-pre-line rounded-xl bg-bg p-3 font-semibold">{transferDetails}</p>
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border-2 border-accent px-4 text-sm font-semibold"
          >
            <Icon name={copied ? 'check' : 'receipt'} className="size-4" />
            {copied ? 'Copiado' : 'Copiar datos'}
          </button>
        </div>
      ) : null}
      <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline underline-offset-4">
        Ver tu reserva en Inicio
      </Link>
    </div>
  )
}
