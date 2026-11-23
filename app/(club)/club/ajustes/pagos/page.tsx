import type { Metadata } from 'next'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { ActionForm } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/viewer'
import { updatePaymentSettings } from '../actions'

export const metadata: Metadata = { title: 'Ajustes · Pagos' }

// Ajustes → Pagos: how players pay, and what they see when they transfer.
export default async function PaymentSettingsPage() {
  const { club } = await requireAdmin('/club/ajustes/pagos')
  return (
    <>
      <SettingsHeader href="/club/ajustes/pagos" />
      <SettingsBlock id="medios" title="Medios de pago" description="Los jugadores eligen entre los que tengas activos al reservar.">
        <ActionForm action={updatePaymentSettings} submitLabel="Guardar pagos">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">Cómo te pagan</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="accepts_cash" defaultChecked={club.accepts_cash} className="size-5 accent-accent" />
              Efectivo en el club
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="accepts_transfer" defaultChecked={club.accepts_transfer} className="size-5 accent-accent" />
              Transferencia
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="transfer_receipt_required" defaultChecked={club.transfer_receipt_required}
                className="size-5 accent-accent" />
              Pedir comprobante de la transferencia
            </label>
          </fieldset>
          <Field label="Datos para transferir" htmlFor="transfer_details">
            <textarea id="transfer_details" name="transfer_details" rows={4} maxLength={500} aria-describedby="transfer_help"
              defaultValue={club.transfer_details ?? ''} className={`${inputClasses} py-2`} />
          </Field>
          <p id="transfer_help" className="text-sm text-fg-muted">Banco, cuenta y titular: se los mostramos al que elige transferir.</p>
        </ActionForm>
      </SettingsBlock>
    </>
  )
}
