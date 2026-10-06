'use client'

import { useActionState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { SubmitButton } from '@/components/ui/submit-button'
import { failed, IDLE, type ActionState } from '@/lib/actions/result'
import { POSTER_TYPES } from '@/lib/domain/championship-poster'
import { uploadChampionshipPoster } from '@/lib/storage/championship-poster'
import type { UploadResult } from '@/lib/storage/receipts'

export type PosterFormProps = {
  championshipId: string
  clubId: string
  posterUrl: string | null
  saveAction: (championshipId: string, path: string) => Promise<ActionState>
  removeAction: (championshipId: string) => Promise<ActionState>
  upload?: (clubId: string, file: File) => Promise<UploadResult>
}

// The championship's poster: the file goes from the browser to Storage, then the championship points at it.
export function PosterForm({ championshipId, clubId, posterUrl, saveAction, removeAction, upload = uploadChampionshipPoster }: PosterFormProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [state, formAction, pending] = useActionState(async (): Promise<ActionState> => {
    // input.files, not FormData: file inputs serialize differently between environments.
    const file = fileInput.current?.files?.[0]
    if (!file || file.size === 0) return failed('Elegí el archivo del afiche.')
    const uploaded = await upload(clubId, file)
    if ('error' in uploaded) return failed(uploaded.error)
    return (await saveAction(championshipId, uploaded.path)) ?? IDLE
  }, IDLE)
  const [removed, removeFormAction, removing] = useActionState(async () => (await removeAction(championshipId)) ?? IDLE, IDLE)
  const outcome = removed.status !== 'idle' ? removed : state

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-semibold">Afiche</h3>
      {posterUrl ? (
        // A plain img: the poster comes from Supabase Storage and next/image would need its host configured.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt="Afiche actual" className="max-h-64 w-full rounded-xl object-contain" />
      ) : (
        <p className="text-sm text-fg-muted">Opcional. PNG, JPG o WebP, hasta 5 MB. Se ve en la página del campeonato.</p>
      )}
      <form action={formAction} className="flex flex-col gap-3">
        <FileField id="championship-poster" name="poster" label="Archivo del afiche" accept={POSTER_TYPES.join(',')} inputRef={fileInput} />
        <SubmitButton label="Guardar afiche" pendingLabel="Subiendo…" pending={pending} />
      </form>
      {posterUrl ? (
        <form action={removeFormAction}>
          <Button type="submit" variant="ghost" fullWidth disabled={removing}>
            Quitar afiche
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
