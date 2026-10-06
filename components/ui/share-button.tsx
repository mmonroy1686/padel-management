'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

// Design: "Compartir": the phone's share sheet when there is one; on a computer it copies the message (with the
// link) and says so.
export function ShareButton({ title, text, label = 'Compartir' }: { title: string; text: string; label?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={share}>
        {label}
      </Button>
      {status === 'copied' ? (
        <p role="status" className="text-sm">
          Link copiado. Pegalo donde quieras.
        </p>
      ) : null}
      {status === 'failed' ? (
        <p role="alert" className="text-sm">
          No pudimos copiarlo. Copiá este mensaje: {text}
        </p>
      ) : null}
    </div>
  )
}
