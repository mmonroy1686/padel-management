import { previewImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'
import { clubPreview } from '@/lib/domain/share-preview'

// What WhatsApp shows for any link of the app without a preview of its own: the club.
export const alt = 'Vista previa del club'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const brand = await loadBrand()
  return previewImage(brand, clubPreview(brand.name))
}
