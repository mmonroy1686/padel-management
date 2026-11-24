import 'server-only'
import type { Club } from '@/lib/auth/viewer'
import { clubInfoView, type ClubInfoView } from '@/lib/domain/club-info'
import { loadClubPhotos } from './club-photos'

// What «El club» shows on Inicio, or null when the club loaded nothing.
export async function loadClubInfo(club: Club): Promise<ClubInfoView | null> {
  const photos = await loadClubPhotos(club.id)
  return clubInfoView(club, photos.map((photo) => photo.url))
}
