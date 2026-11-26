'use client'

import { useActionState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { FileField } from '@/components/ui/file-field'
import { failed, IDLE, type ActionState } from '@/lib/actions/result'
import { AVATAR_TYPES, type ProfileAvatar } from '@/lib/domain/contact'
import { uploadAvatar } from '@/lib/storage/avatar'
import type { UploadResult } from '@/lib/storage/receipts'

export type AvatarFormProps = {
  userId: string
  name: string
  profile: ProfileAvatar
  saveAction: (path: string) => Promise<ActionState>
  removeAction: () => Promise<ActionState>
  upload?: (userId: string, file: File) => Promise<UploadResult>
}

// Perfil → la foto: picking a file is saving it (to the player's own folder, then the profile points at it).
// "Quitar foto" leaves the initials, and the Google photo does not come back.
export function AvatarForm({ userId, name, profile, saveAction, removeAction, upload = uploadAvatar }: AvatarFormProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(async (): Promise<ActionState> => {
    const file = fileInput.current?.files?.[0]
    if (!file || file.size === 0) return failed('Elegí una foto.')
    const uploaded = await upload(userId, file)
    if ('error' in uploaded) return failed(uploaded.error)
    return (await saveAction(uploaded.path)) ?? IDLE
  }, IDLE)
  const [removed, removeFormAction, removing] = useActionState(async () => (await removeAction()) ?? IDLE, IDLE)
  const outcome = removed.status !== 'idle' ? removed : state
  const hasPhoto = profile.avatar_source === 'upload' || profile.avatar_source === 'google'

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} profile={profile} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <form ref={form} action={formAction}>
          <FileField
            id="player-avatar"
            name="avatar"
            label="Tu foto"
            buttonLabel={hasPhoto ? 'Cambiar foto' : 'Subir foto'}
            accept={AVATAR_TYPES.join(',')}
            inputRef={fileInput}
            onPick={() => form.current?.requestSubmit()}
          />
        </form>
        {hasPhoto ? (
          <form action={removeFormAction}>
            <Button type="submit" variant="ghost" size="sm" disabled={removing}>
              Quitar foto
            </Button>
          </form>
        ) : null}
        {pending ? (
          <p role="status" className="text-sm text-fg-muted">
            Subiendo la foto…
          </p>
        ) : outcome.status === 'error' ? (
          <p role="alert" className="text-sm text-danger">
            {outcome.message}
          </p>
        ) : outcome.status === 'ok' ? (
          <p role="status" className="text-sm">
            {outcome.message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
