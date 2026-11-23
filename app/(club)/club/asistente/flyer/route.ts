import { getViewer } from '@/lib/auth/viewer'
import { freeSlotsImage, loadFlyerFont } from '@/lib/brand/free-slots-image'
import { loadBrand } from '@/lib/brand/load-brand'
import { flyerBackgroundDataUrl } from '@/lib/brand/logo-data-url'
import { loadDayGrid } from '@/lib/data/day'
import { flyerContact, flyerDayText, flyerLayout } from '@/lib/domain/free-slots-flyer'
import { clubLogoUrl } from '@/lib/domain/club-logo'
import { isLocalDate } from '@/lib/domain/input'
import { isStaffRole } from '@/lib/domain/profile'
import { localDateOf } from '@/lib/domain/time'
import { getSupabaseEnv } from '@/lib/supabase/env'

// GET /club/asistente/flyer?date=YYYY-MM-DD: the free-slots flyer of that day (today without a date), for
// reception to post. Staff only: it is drawn from the club's grid.
export async function GET(request: Request) {
  const viewer = await getViewer()
  if (!viewer?.membership || !isStaffRole(viewer.membership.role)) {
    return new Response('No tenés permiso para ver esto.', { status: 403 })
  }
  const { club } = viewer
  const now = new Date()
  const requested = new URL(request.url).searchParams.get('date')
  const date = isLocalDate(requested) ? requested : localDateOf(now, club.timezone)
  const [brand, grid, font, background] = await Promise.all([
    loadBrand(),
    loadDayGrid(club, date, { userId: viewer.userId, audience: 'staff' }, now),
    loadFlyerFont(),
    flyerBackgroundDataUrl(clubLogoUrl(getSupabaseEnv().url, club.flyer_background_path)),
  ])
  return freeSlotsImage(brand, flyerLayout(grid), {
    day: flyerDayText(date).toUpperCase(),
    contact: flyerContact(club.phone),
  }, font, background)
}
