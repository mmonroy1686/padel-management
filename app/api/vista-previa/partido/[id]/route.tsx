import { previewImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'
import { loadMatchPreview } from '@/lib/data/share-preview'
import { clubPreview } from '@/lib/domain/share-preview'

// The image of a shared open match: "Falta 1 de revés · jue 20:00" on the club's colors; the club alone once it
// filled up. A route of its own and not an opengraph-image file: under the (jugador) group that file's URL carries a
// hash, and the sign-in page has to point at it too.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [brand, preview] = await Promise.all([loadBrand(), loadMatchPreview(id)])
  return previewImage(brand, preview ?? clubPreview(brand.name))
}
