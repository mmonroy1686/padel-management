import { previewImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'
import { posterDataUrl } from '@/lib/brand/logo-data-url'
import { loadPublicChampionship } from '@/lib/data/championship-fixture'
import { isPublicCode } from '@/lib/domain/championship-public'
import { championshipPosterUrl } from '@/lib/domain/championship-poster'
import { championshipPreview, clubPreview } from '@/lib/domain/share-preview'
import { getSupabaseEnv } from '@/lib/supabase/env'

// A shared championship: its poster when it has one, its name and dates, on the club's colors.
export const alt = 'Campeonato'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [brand, data] = await Promise.all([loadBrand(), isPublicCode(code) ? loadPublicChampionship(code) : null])
  if (!data) return previewImage(brand, clubPreview(brand.name))
  const poster = await posterDataUrl(championshipPosterUrl(getSupabaseEnv().url, data.championship.posterPath))
  return previewImage(brand, championshipPreview(data.championship), poster)
}
