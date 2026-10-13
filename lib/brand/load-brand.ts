import 'server-only'
import { getClub } from '@/lib/auth/viewer'
import { brandOf } from '@/lib/domain/club-brand'
import { clubLogoUrl } from '@/lib/domain/club-logo'
import { clubTheme, type Tokens } from '@/lib/domain/club-theme'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { logoDataUrl } from './logo-data-url'

// What the icon and the share previews draw: the club's name, its dark palette and its logo, if it can be drawn.
export type LoadedBrand = { name: string; colors: Tokens; logo: string | null }

export async function loadBrand(): Promise<LoadedBrand> {
  const club = await getClub()
  return {
    name: club.name,
    colors: clubTheme(brandOf(club)).dark,
    logo: await logoDataUrl(clubLogoUrl(getSupabaseEnv().url, club.logo_path)),
  }
}
