import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { AMENITIES, mapStart } from '@/lib/domain/club-info'
import type { ClubInfoClub } from '@/lib/domain/club-info'
import { LocationPicker } from './location-picker'

const legend = 'font-display text-xl font-bold uppercase'

// Ajustes → "Datos del club": contact, location and services, saved together. The photos have their own form.
export function ClubInfoForm({ club, action }: { club: ClubInfoClub; action: FormAction }) {
  const pin = club.latitude !== null && club.longitude !== null ? { latitude: club.latitude, longitude: club.longitude } : null
  return (
    <ActionForm action={action} submitLabel="Guardar datos" className="gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className={legend}>Contacto</legend>
        <Field label="WhatsApp" htmlFor="club-phone" hint="El mismo del flyer: el botón de Inicio abre el chat con este número.">
          <input id="club-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30}
            defaultValue={club.phone ?? ''} aria-describedby="club-phone-hint" placeholder="092 369 558" className={inputClasses} />
        </Field>
        <Field label="Instagram" htmlFor="club-instagram">
          <input id="club-instagram" name="instagram" maxLength={80} autoCapitalize="none" defaultValue={club.instagram ?? ''}
            placeholder="@rusticpadel" className={inputClasses} />
        </Field>
        <Field label="Email de contacto" htmlFor="club-email">
          <input id="club-email" name="contact_email" type="email" inputMode="email" autoComplete="email" maxLength={200}
            defaultValue={club.contact_email ?? ''} placeholder="hola@club.com" className={inputClasses} />
        </Field>
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className={legend}>Ubicación</legend>
        <LocationPicker address={club.address} pin={pin} googleMapsUrl={club.google_maps_url} timezone={club.timezone}
          start={mapStart(club.timezone)} />
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className={legend}>Servicios</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {AMENITIES.map((amenity) => (
            <label key={amenity.key} className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-bg px-3">
              <input type="checkbox" name="amenities" value={amenity.key} defaultChecked={club.amenities.includes(amenity.key)}
                className="h-5 w-5 accent-accent" />
              {amenity.label}
            </label>
          ))}
        </div>
      </fieldset>
    </ActionForm>
  )
}
