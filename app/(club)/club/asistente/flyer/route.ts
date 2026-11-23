import { getSiteUrl } from '@/lib/auth/redirect'
import { getViewer } from '@/lib/auth/viewer'
import { freeSlotsImage, loadFlyerFont } from '@/lib/brand/free-slots-image'
import { loadBrand } from '@/lib/brand/load-brand'
import { loadDayGrid } from '@/lib/data/day'
import { flyerContact, flyerDayText, flyerLayout } from '@/lib/domain/free-slots-flyer'
import { isLocalDate } from '@/lib/domain/input'
import { isStaffRole } from '@/lib/domain/profile'
import { localDateOf } from '@/lib/domain/time'

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
  const [brand, grid, font] = await Promise.all([
    loadBrand(),
    loadDayGrid(club, date, { userId: viewer.userId, audience: 'staff' }, now),
    loadFlyerFont(),
  ])
  return freeSlotsImage(brand, flyerLayout(grid), {
    day: flyerDayText(date).toUpperCase(),
    contact: flyerContact(club.phone, getSiteUrl()),
  }, font)
}
