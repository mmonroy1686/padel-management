'use client'

import { useActionState, useRef } from 'react'
import { ClubLogo } from '@/components/brand/club-logo'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { failed, IDLE, type ActionState } from '@/lib/actions/result'
import { LOGO_TYPES } from '@/lib/domain/club-logo'
import { uploadClubLogo } from '@/lib/storage/club-logo'
import type { UploadResult } from '@/lib/storage/receipts'

export type LogoFormProps = {
  club: { id: string; name: string; logo_path: string | null }
  saveAction: (path: string) => Promise<ActionState>
  removeAction: () => Promise<ActionState>
  upload?: (clubId: string, file: File) => Promise<UploadResult>
}

// Ajustes → Logo: the file goes from the browser to Storage, then the club points at it.
export function LogoForm({ club, saveAction, removeAction, upload = uploadClubLogo }: LogoFormProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [state, formAction, pending] = useActionState(async (): Promise<ActionState> => {
    // input.files, not FormData: file inputs serialize differently between environments.
    const file = fileInput.current?.files?.[0]
    if (!file || file.size === 0) return failed('Elegí el archivo del logo.')
    const uploaded = await upload(club.id, file)
    if ('error' in uploaded) return failed(uploaded.error)
    return (await saveAction(uploaded.path)) ?? IDLE
  }, IDLE)
  const [removed, removeFormAction, removing] = useActionState(async () => (await removeAction()) ?? IDLE, IDLE)
  const outcome = removed.status !== 'idle' ? removed : state

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <ClubLogo club={club} className="size-20 rounded-xl bg-bg p-2" />
        <p className="text-sm text-fg-muted">
          Se ve arriba en todas las pantallas y al ingresar. PNG, JPG, WebP o SVG, hasta 2 MB. Mejor cuadrado y con fondo
          transparente.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <label htmlFor="club-logo" className="text-sm font-semibold">
          Archivo del logo
        </label>
        <input ref={fileInput} id="club-logo" name="logo" type="file" accept={LOGO_TYPES.join(',')} />
        <SubmitButton label="Guardar logo" pendingLabel="Subiendo…" pending={pending} />
      </form>
      {club.logo_path ? (
        <form action={removeFormAction}>
          <Button type="submit" variant="ghost" fullWidth disabled={removing}>
            Quitar logo
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
