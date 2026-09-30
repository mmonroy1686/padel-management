'use client'

import { useState } from 'react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button, buttonClasses } from '@/components/ui/button'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { whatsappUrl } from '@/lib/domain/match-share'

// Prototype: sheet "share". The link in the message leads straight to the match.
export function ShareSheet({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="Compartir en el grupo">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          Pegalo en el grupo de WhatsApp del club. Quien toque el link se suma directo en la app.
        </p>
        <label htmlFor="share-text" className="sr-only">
          Mensaje
        </label>
        <textarea id="share-text" readOnly value={text} rows={8} className={cn(inputClasses, 'py-2')} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={copy}>Copiar mensaje</Button>
          <a href={whatsappUrl(text)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary' })}>
            Abrir WhatsApp
          </a>
        </div>
        {copied ? <p role="status">Mensaje copiado.</p> : null}
      </div>
    </BottomSheet>
  )
}
