import type { Metadata } from 'next'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { ActionForm } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/viewer'
import { LOYALTY_EXPIRY_OPTIONS, loyaltyRuleOf, loyaltyRuleText } from '@/lib/domain/loyalty'
import { updateLoyalty } from '../actions'

export const metadata: Metadata = { title: 'Ajustes · Sellos' }

// Ajustes → Sellos: the day use's loyalty card.
export default async function LoyaltySettingsPage() {
  const { club } = await requireAdmin('/club/ajustes/sellos')
  return (
    <>
      <SettingsHeader href="/club/ajustes/sellos" />
      <SettingsBlock
        id="sellos"
        title="Sellos"
        description="Cada ingreso de day use suma un sello. Con los sellos completos, el jugador tiene un descuento en su próximo day use."
      >
        <ActionForm action={updateLoyalty} submitLabel="Guardar sellos">
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="loyalty_enabled" defaultChecked={club.loyalty_enabled} className="size-5 accent-accent" />
            Dar sellos por cada day use
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Day use para la recompensa" htmlFor="loyalty_every">
              <input id="loyalty_every" name="loyalty_every" type="number" min={1} max={50}
                defaultValue={club.loyalty_every} className={inputClasses} />
            </Field>
            <Field label="Descuento de la recompensa (%)" htmlFor="loyalty_discount_percent">
              <input id="loyalty_discount_percent" name="loyalty_discount_percent" type="number" min={1} max={100}
                defaultValue={club.loyalty_discount_percent} className={inputClasses} />
            </Field>
            <Field label="Los sellos vencen" htmlFor="loyalty_expiry_months">
              <select id="loyalty_expiry_months" name="loyalty_expiry_months"
                defaultValue={club.loyalty_expiry_months ?? 'never'} className={inputClasses}>
                <option value="never">No vencen</option>
                {LOYALTY_EXPIRY_OPTIONS.map((months) => (
                  <option key={months} value={months}>
                    A los {months} meses
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {club.loyalty_enabled ? <p className="text-sm text-fg-muted">{loyaltyRuleText(loyaltyRuleOf(club))}</p> : null}
        </ActionForm>
      </SettingsBlock>
    </>
  )
}
