import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import type { WaitItem } from '@/lib/domain/waitlist'

// Design: "Inicio", the "Esperando turno" card under "Tus reservas".
export function WaitingCard({ waits, cancelAction }: { waits: WaitItem[]; cancelAction: FormAction }) {
  if (waits.length === 0) return null
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold uppercase">Esperando turno</h2>
      <ul aria-label="Tus esperas" className="flex flex-col gap-2">
        {waits.map((wait) => (
          <li key={wait.id} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
            <span>{wait.text}</span>
            <ActionForm action={cancelAction} submitLabel="Cancelar" pendingLabel="Cancelando…" variant="ghost">
              <input type="hidden" name="waitId" value={wait.id} />
            </ActionForm>
          </li>
        ))}
      </ul>
    </Card>
  )
}
