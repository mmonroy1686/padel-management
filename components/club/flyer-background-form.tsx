'use client'

import { useActionState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { SubmitButton } from '@/components/ui/submit-button'
import { failed, IDLE, type ActionState } from '@/lib/actions/result'
import { clubLogoUrl, FLYER_SOURCE_TYPES } from '@/lib/domain/club-logo'
import { uploadFlyerBackground } from '@/lib/storage/flyer-background'
import type { UploadResult } from '@/lib/storage/receipts'
import { getSupabaseEnv } from '@/lib/supabase/env'

export type FlyerBackgroundFormProps = {
  club: { id: string; flyer_background_path: string | null }
  saveAction: (path: string) => Promise<ActionState>
  removeAction: () => Promise<ActionState>
  upload?: (clubId: string, file: File) => Promise<UploadResult>
}

// Ajustes → the flyer's background: the browser blurs the photo and uploads it, then the club points at it.
export function FlyerBackgroundForm({ club, saveAction, removeAction, upload = uploadFlyerBackground }: FlyerBackgroundFormProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [state, formAction, pending] = useActionState(async (): Promise<ActionState> => {
    // input.files, not FormData: file inputs serialize differently between environments.
    const file = fileInput.current?.files?.[0]
    if (!file || file.size === 0) return failed('Elegí la foto del fondo.')
    const uploaded = await upload(club.id, file)
    if ('error' in uploaded) return failed(uploaded.error)
    return (await saveAction(uploaded.path)) ?? IDLE
  }, IDLE)
  const [removed, removeFormAction, removing] = useActionState(async () => (await removeAction()) ?? IDLE, IDLE)
  const outcome = removed.status !== 'idle' ? removed : state
  const current = clubLogoUrl(getSupabaseEnv().url, club.flyer_background_path)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small preview of a Storage file, like the logo
          <img src={current} alt="Fondo actual del flyer" className="h-28 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <div aria-hidden="true" className="h-28 w-16 shrink-0 rounded-lg border border-dashed border-border bg-bg" />
        )}
        <p className="text-sm text-fg-muted">
          Una foto del club, que va de fondo difuminada detrás de los horarios. JPG, PNG o WebP, hasta 15 MB: la
          achicamos antes de subirla.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <FileField id="flyer-background" name="background" label="Foto de fondo" accept={FLYER_SOURCE_TYPES.join(',')} inputRef={fileInput} />
        <SubmitButton label="Guardar fondo" pendingLabel="Subiendo…" pending={pending} />
      </form>
      {club.flyer_background_path ? (
        <form action={removeFormAction}>
          <Button type="submit" variant="ghost" fullWidth disabled={removing}>
            Quitar fondo
          </Button>
        </form>
      ) : null}
      {outcome.status === 'error' ? (
        <p role="alert" className="rounded-xl border border-accent bg-bg p-3 text-sm">
          {outcome.message}
        </p>
      ) : null}
      {outcome.status === 'ok' ? (
        <p role="status" className="text-sm">
          {outcome.message}
        </p>
      ) : null}
    </div>
  )
}
