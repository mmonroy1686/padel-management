import type { Metadata } from 'next'
import { BrandForm } from '@/components/club/brand-form'
import { LogoForm } from '@/components/club/logo-form'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { AutoSaveForm } from '@/components/ui/auto-save-form'
import { Field, inputClasses } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/viewer'
import { removeClubLogo, saveClubBrand, saveClubLogo, updateClubName } from './actions'

export const metadata: Metadata = { title: 'Ajustes · Club' }

// Ajustes → Club: who the club is, everywhere in the app.
export default async function ClubSettingsPage() {
  const { club } = await requireAdmin('/club/ajustes')
  return (
    <>
      <SettingsHeader href="/club/ajustes" />
      <SettingsBlock id="nombre" title="Nombre del club" description="Se ve arriba en todas las pantallas, en la pestaña y al compartir links.">
        <AutoSaveForm action={updateClubName} label="el nombre del club">
          <Field label="Nombre" htmlFor="club-name">
            <input id="club-name" name="name" required minLength={2} maxLength={40} defaultValue={club.name} className={inputClasses} />
          </Field>
        </AutoSaveForm>
      </SettingsBlock>
      <SettingsBlock id="logo" title="Logo">
        <LogoForm club={club} saveAction={saveClubLogo} removeAction={removeClubLogo} />
      </SettingsBlock>
      <SettingsBlock
        id="marca"
        title="Marca del club"
        description="El color principal va en los botones y lo que se destaca; el fondo, detrás de todo. La app arma el resto y corrige lo que haga falta para que todo se lea."
      >
        <BrandForm club={club} action={saveClubBrand} />
      </SettingsBlock>
    </>
  )
}
