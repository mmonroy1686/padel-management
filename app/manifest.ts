import type { MetadataRoute } from 'next'
import { findClub } from '@/lib/auth/viewer'
import { brandOrDefault, NO_CLUB_NAME, webManifest } from '@/lib/domain/club-brand'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Each subdomain is its own installable app, with its club's name and colors.
  const club = await findClub()
  return webManifest(club?.name ?? NO_CLUB_NAME, brandOrDefault(club))
}
