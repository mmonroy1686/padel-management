import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { CLUB_SLUG } from '@/lib/club/config'
import { isProfileComplete, isStaffRole } from '@/lib/domain/profile'
import type { Tables } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

export type Club = Tables<'clubs'>
export type Membership = Tables<'club_members'>
export type Viewer = {
  userId: string
  email: string | null
  profile: Tables<'profiles'>
  club: Club
  membership: Membership | null
}
export type MemberViewer = Viewer & { membership: Membership }

export const getClub = cache(async (): Promise<Club> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('clubs').select('*').eq('slug', CLUB_SLUG).maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error(`No existe el club "${CLUB_SLUG}". Local: npm run db:reset. Producción: falta la migración de datos.`)
  }
  return data
})

// Who is looking, read once per request.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const club = await getClub()
  const [profile, membership] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('club_members').select('*').eq('club_id', club.id).eq('user_id', user.id).maybeSingle(),
  ])
  if (profile.error) throw profile.error
  if (membership.error) throw membership.error

  return { userId: user.id, email: user.email ?? null, profile: profile.data, club, membership: membership.data }
})

export async function requireViewer(nextPath: string): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect(`/auth/ingreso?next=${encodeURIComponent(nextPath)}`)
  return viewer
}

// A player needs side, hand and category before booking.
export async function requirePlayer(nextPath: string): Promise<MemberViewer> {
  const viewer = await requireViewer(nextPath)
  const { membership } = viewer
  if (!membership || !isProfileComplete(viewer.profile, membership)) {
    redirect(`/bienvenida?next=${encodeURIComponent(nextPath)}`)
  }
  return { ...viewer, membership }
}

// Every club page checks this itself, not only the layout.
export async function requireStaff(nextPath: string): Promise<MemberViewer> {
  const viewer = await requireViewer(nextPath)
  const { membership } = viewer
  if (!membership || !isStaffRole(membership.role)) redirect('/')
  return { ...viewer, membership }
}

export async function requireAdmin(nextPath: string): Promise<MemberViewer> {
  const viewer = await requireStaff(nextPath)
  if (viewer.membership.role !== 'admin') redirect('/club/grilla')
  return viewer
}
