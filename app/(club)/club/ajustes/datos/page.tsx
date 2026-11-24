import type { Metadata } from 'next'
import { ClubInfoForm } from '@/components/club-info/club-info-form'
import { ClubPhotosForm } from '@/components/club-info/club-photos-form'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { requireAdmin } from '@/lib/auth/viewer'
import { loadClubPhotos } from '@/lib/data/club-photos'
import { addClubPhoto, moveClubPhoto, removeClubPhoto, saveClubInfo } from './actions'

export const metadata: Metadata = { title: 'Ajustes · Datos del club' }

// Ajustes → "Datos del club": what players see about the club at the end of Inicio.
export default async function ClubInfoSettingsPage() {
  const { club } = await requireAdmin('/club/ajustes/datos')
  const photos = await loadClubPhotos(club.id)
  return (
    <>
      <SettingsHeader href="/club/ajustes/datos" />
      <SettingsBlock id="datos" title="Contacto, ubicación y servicios" description="Lo que dejes vacío no se muestra.">
        <ClubInfoForm club={club} action={saveClubInfo} />
      </SettingsBlock>
      <SettingsBlock id="fotos" title="Fotos" description="Hasta 8. La primera es la portada de la sección «El club» en Inicio.">
        <ClubPhotosForm clubId={club.id} photos={photos} addAction={addClubPhoto} removeAction={removeClubPhoto} moveAction={moveClubPhoto} />
      </SettingsBlock>
    </>
  )
}
