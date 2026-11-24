'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import type { ActionState } from '@/lib/actions/result'
import { FLYER_SOURCE_TYPES } from '@/lib/domain/club-logo'
import { MAX_CLUB_PHOTOS } from '@/lib/domain/club-info'
import { uploadClubPhoto } from '@/lib/storage/club-photo'
import type { UploadResult } from '@/lib/storage/receipts'

export type ClubPhotosFormProps = {
  clubId: string
  photos: { id: string; url: string }[]
  addAction: (path: string) => Promise<ActionState>
  removeAction: (photoId: string) => Promise<ActionState>
  moveAction: (photoId: string, step: number) => Promise<ActionState>
  upload?: (clubId: string, file: File, now?: number) => Promise<UploadResult>
}

// Ajustes → "Datos del club" → Fotos: upload one or several (the browser shrinks each), remove, and move with ← →.
// The first one is the cover on Inicio.
export function ClubPhotosForm({ clubId, photos, addAction, removeAction, moveAction, upload = uploadClubPhoto }: ClubPhotosFormProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const room = MAX_CLUB_PHOTOS - photos.length

  function report(result: ActionState | undefined) {
    if (result?.status === 'error') setMessage({ kind: 'error', text: result.message ?? '' })
    else if (result?.status === 'ok') setMessage({ kind: 'ok', text: result.message ?? '' })
  }

  function onUpload() {
    const files = Array.from(fileInput.current?.files ?? [])
    if (files.length === 0) return setMessage({ kind: 'error', text: 'Elegí las fotos para subir.' })
    if (files.length > room) {
      return setMessage({ kind: 'error', text: room === 0 ? 'Ya hay 8 fotos. Quitá una para subir otra.' : `Entran ${room} fotos más.` })
    }
    startTransition(async () => {
      const now = Date.now()
      for (const [index, file] of files.entries()) {
        const uploaded = await upload(clubId, file, now + index)
        if ('error' in uploaded) return setMessage({ kind: 'error', text: uploaded.error })
        const result = await addAction(uploaded.path)
        if (result.status === 'error') return report(result)
      }
      if (fileInput.current) fileInput.current.value = ''
      setMessage({ kind: 'ok', text: files.length === 1 ? 'Foto agregada.' : `${files.length} fotos agregadas.` })
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {photos.length > 0 ? (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- a preview of a Storage file, like the logo */}
              <img src={photo.url} alt={index === 0 ? 'Foto de portada' : `Foto ${index + 1}`}
                className="aspect-[4/3] w-full rounded-lg object-cover" />
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={pending || index === 0} aria-label={`Mover la foto ${index + 1} antes`}
                  onClick={() => startTransition(async () => report(await moveAction(photo.id, -1)))}>
                  ←
                </Button>
                <Button size="sm" variant="ghost" disabled={pending || index === photos.length - 1} aria-label={`Mover la foto ${index + 1} después`}
                  onClick={() => startTransition(async () => report(await moveAction(photo.id, 1)))}>
                  →
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} aria-label={`Quitar la foto ${index + 1}`}
                  onClick={() => startTransition(async () => report(await removeAction(photo.id)))}>
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-fg-muted">Todavía no hay fotos. La primera que subas es la portada.</p>
      )}
      {room > 0 ? (
        <div className="flex flex-col gap-3">
          <FileField id="club-photos" name="photos" label={`Subir fotos (entran ${room} más)`} accept={FLYER_SOURCE_TYPES.join(',')}
            inputRef={fileInput} multiple />
          <Button onClick={onUpload} disabled={pending} fullWidth>
            {pending ? 'Subiendo…' : 'Subir fotos'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">Ya hay 8 fotos, el máximo. Quitá una para subir otra.</p>
      )}
      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'rounded-xl border border-accent bg-bg p-3 text-sm' : 'text-sm'}>
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
