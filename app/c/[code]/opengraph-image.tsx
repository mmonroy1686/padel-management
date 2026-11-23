import { championshipShareImage, previewImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'
import { loadPublicChampionship } from '@/lib/data/championship-fixture'
import { championshipPosterUrl } from '@/lib/domain/championship-poster'
import { isPublicCode } from '@/lib/domain/championship-public'
import { clubPreview } from '@/lib/domain/share-preview'
import { getSupabaseEnv } from '@/lib/supabase/env'

// A shared championship: its poster, or just its name when it has none. No size or contentType export: a poster keeps
// its own dimensions and format, so the tags would lie.
export const alt = 'Campeonato'

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [brand, data] = await Promise.all([loadBrand(), isPublicCode(code) ? loadPublicChampionship(code) : null])
  if (!data) return previewImage(brand, clubPreview(brand.name))
  const { championship } = data
  return championshipShareImage(brand, {
    name: championship.name,
    posterUrl: championshipPosterUrl(getSupabaseEnv().url, championship.posterPath),
  })
}
