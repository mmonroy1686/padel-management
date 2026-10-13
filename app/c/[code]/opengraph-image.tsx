import { previewImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'
import { loadPublicChampionship } from '@/lib/data/championship-fixture'
import { isPublicCode } from '@/lib/domain/championship-public'
import { championshipPreview, clubPreview } from '@/lib/domain/share-preview'

// A shared championship: its name and dates on the club's colors.
export const alt = 'Campeonato'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [brand, data] = await Promise.all([loadBrand(), isPublicCode(code) ? loadPublicChampionship(code) : null])
  return previewImage(brand, data ? championshipPreview(data.championship) : clubPreview(brand.name))
}
