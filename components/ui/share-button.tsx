'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

// The phone's share sheet when there is one; on a computer it copies the message (with the link) and says so.
export function useShare(title: string, text: string) {
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

  return { share, status }
}

// What happened when there was no share sheet.
export function ShareStatus({ status, text }: { status: 'idle' | 'copied' | 'failed'; text: string }) {
  if (status === 'copied') {
    return (
      <p role="status" className="text-sm">
        Link copiado. Pegalo donde quieras.
      </p>
    )
  }
  if (status === 'failed') {
    return (
      <p role="alert" className="text-sm">
        No pudimos copiarlo. Copiá este mensaje: {text}
      </p>
    )
  }
  return null
}

// Design: "Compartir".
export function ShareButton({ title, text, label = 'Compartir' }: { title: string; text: string; label?: string }) {
  const { share, status } = useShare(title, text)
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={share}>
        {label}
      </Button>
      <ShareStatus status={status} text={text} />
    </div>
  )
}
