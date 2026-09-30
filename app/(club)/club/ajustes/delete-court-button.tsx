'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'

// Asks before deleting. The database refuses a court with history, and the error stays in the sheet.
export function DeleteCourtButton({ courtId, courtName, action }: { courtId: string; courtName: string; action: FormAction }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <Button variant="danger" fullWidth onClick={() => setOpen(true)}>
        Borrar cancha
      </Button>
      <BottomSheet open={open} onClose={close} title={`Borrar ${courtName}`}>
        <p className="mb-4">
          Solo se puede borrar una cancha que nunca tuvo reservas, turnos fijos ni partidos. Si ya se usó,
          desmarcá «Activa» para dejar de ofrecerla.
        </p>
        <ActionForm action={action} submitLabel="Sí, borrar" pendingLabel="Borrando…" variant="danger" onDone={close}>
          <input type="hidden" name="courtId" value={courtId} />
        </ActionForm>
      </BottomSheet>
    </>
  )
}
