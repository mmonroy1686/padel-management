import type { MetadataRoute } from 'next'
import { getClub } from '@/lib/auth/viewer'
import { brandOf, webManifest } from '@/lib/domain/club-brand'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const club = await getClub()
  return webManifest(club.name, brandOf(club))
}
