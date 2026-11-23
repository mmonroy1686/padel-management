import type { MetadataRoute } from 'next'
import { findClub } from '@/lib/auth/viewer'
import { brandOf, DEFAULT_BRAND, webManifest } from '@/lib/domain/club-brand'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Each subdomain is its own installable app, with its club's name and colors.
  const club = await findClub()
  return club ? webManifest(club.name, brandOf(club)) : webManifest('Club no encontrado', DEFAULT_BRAND)
}
