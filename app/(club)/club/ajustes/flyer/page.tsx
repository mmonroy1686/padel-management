import type { Metadata } from 'next'
import { FlyerBackgroundForm } from '@/components/club/flyer-background-form'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { ActionForm } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/viewer'
import { removeFlyerBackground, saveFlyerBackground, updateClubPhone } from '../actions'

export const metadata: Metadata = { title: 'Ajustes · Flyer' }

// Ajustes → Flyer: what the Asistente's free-slots flyer shows besides the times.
export default async function FlyerSettingsPage() {
  const { club } = await requireAdmin('/club/ajustes/flyer')
  return (
    <>
      <SettingsHeader href="/club/ajustes/flyer" />
      <SettingsBlock
        id="whatsapp"
        title="WhatsApp del club"
        description="Sale al pie del flyer. Si lo dejás vacío, el pie muestra solo el logo y el nombre del club."
      >
        <ActionForm action={updateClubPhone} submitLabel="Guardar WhatsApp">
          <Field label="WhatsApp" htmlFor="club-phone">
            <input id="club-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30}
              defaultValue={club.phone ?? ''} placeholder="092 369 558" className={inputClasses} />
          </Field>
        </ActionForm>
      </SettingsBlock>
      <SettingsBlock id="fondo" title="Foto de fondo">
        <FlyerBackgroundForm club={club} saveAction={saveFlyerBackground} removeAction={removeFlyerBackground} />
      </SettingsBlock>
    </>
  )
}
