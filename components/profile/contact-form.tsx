import type { FormAction } from '@/components/ui/action-form'
import { AutoSaveForm } from '@/components/ui/auto-save-form'
import { Field, inputClasses } from '@/components/ui/field'
import { formatPhone } from '@/lib/domain/format'
import type { PlayerContact } from '@/lib/domain/contact'

// Perfil → WhatsApp: the number (optional) and, apart, the consent for the club to write (unchecked until the player
// checks it). Saves itself; the action refuses the consent without a number and says so.
export function ContactForm({ contact, action }: { contact: PlayerContact | null; action: FormAction }) {
  return (
    <AutoSaveForm action={action} label="tu WhatsApp">
      <Field label="Tu WhatsApp (opcional)" htmlFor="player-phone" hint="Por ejemplo 099 123 456.">
        <input
          id="player-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={30}
          defaultValue={contact?.phone ? formatPhone(contact.phone) : ''}
          aria-describedby="player-phone-hint"
          className={inputClasses}
        />
      </Field>
      <label className="flex min-h-11 items-start gap-3 pt-1">
        <input
          type="checkbox"
          name="whatsappConsent"
          defaultChecked={contact?.whatsappConsent ?? false}
          className="mt-0.5 size-5 shrink-0 accent-accent"
        />
        <span className="flex flex-col gap-1">
          <span>Acepto que el club me escriba por WhatsApp</span>
          <span className="text-sm text-fg-muted">
            Para invitarte a partidos y avisarte de tus reservas. Lo podés sacar cuando quieras.
          </span>
        </span>
      </label>
    </AutoSaveForm>
  )
}
