import { iconImage } from '@/lib/brand/brand-images'
import { loadBrand } from '@/lib/brand/load-brand'

// The tab and the installed app: the club's logo on its background, or its initials on its primary color.
// It reads the club on every request (getClub uses the session cookies), so a new logo shows without a deploy.
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default async function Icon() {
  return iconImage(await loadBrand(), size.width)
}
