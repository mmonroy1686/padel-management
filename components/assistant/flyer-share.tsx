'use client'

import { useState } from 'react'
import { Button, buttonClasses } from '@/components/ui/button'
import { whatsappUrl } from '@/lib/domain/match-share'

type Status = 'idle' | 'downloaded' | 'copied' | 'failed'
const MESSAGES: Record<Exclude<Status, 'idle'>, string> = {
  downloaded: 'Bajamos la imagen. Adjuntala en WhatsApp o en tus historias.',
  copied: 'Texto copiado. Pegalo en el grupo del club.',
  failed: 'No pudimos hacerlo. Probá de nuevo en un momento.',
}

// "Difundir libres": the flyer's preview, "Compartir imagen" (the phone's share sheet with the file, or a download
// where there is none), "Copiar texto" and "Abrir WhatsApp".
export function FlyerShare({ imageUrl, fileName, text }: { imageUrl: string; fileName: string; text: string }) {
  const [status, setStatus] = useState<Status>('idle')

  async function shareImage() {
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error('No se pudo bajar el flyer')
      const blob = await response.blob()
      const file = new File([blob], fileName, { type: 'image/png' })
      if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text })
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
        }
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
      setStatus('downloaded')
    } catch {
      setStatus('failed')
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <section aria-labelledby="difundir" className="flex flex-col gap-3">
      <h2 id="difundir" className="font-display text-2xl font-bold uppercase">
        Difundir libres
      </h2>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn per request by our route, not a static asset */}
      <img
        src={imageUrl}
        alt="Flyer de turnos libres"
        width={270}
        height={480}
        className="h-auto w-full max-w-xs self-center rounded-xl border border-border"
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={shareImage}>Compartir imagen</Button>
        <Button variant="secondary" onClick={copyText}>
          Copiar texto
        </Button>
        <a href={whatsappUrl(text)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary' })}>
          Abrir WhatsApp
        </a>
      </div>
      {status === 'idle' ? null : (
        <p role={status === 'failed' ? 'alert' : 'status'} className="text-sm">
          {MESSAGES[status]}
        </p>
      )}
    </section>
  )
}
