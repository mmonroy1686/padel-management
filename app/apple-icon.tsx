import { iconImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'

// "Agregar a inicio" on an iPhone: the same mark as app/icon.tsx, at Apple's size.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default async function AppleIcon() {
  return iconImage(await loadBrand(), size.width)
}
