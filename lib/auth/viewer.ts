import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'
import { clubSlugFromHost } from '@/lib/club/host'
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

// The host's club, read from the host itself: no header to forge, the same answer on every route.
export const clubSlug = cache(async (): Promise<string> => {
  const incoming = await headers()
  return clubSlugFromHost(incoming.get('x-forwarded-host') ?? incoming.get('host'))
})

// The host's club, or null when the subdomain has none. For what renders around every page (the root layout, metadata,
// manifest, icons), which must not fail: the page itself says "Club no encontrado".
export const findClub = cache(async (): Promise<Club | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('clubs').select('*').eq('slug', await clubSlug()).maybeSingle()
  if (error) throw error
  return data
})

// The host's club; a subdomain without a club is a 404 (app/not-found.tsx).
export const getClub = cache(async (): Promise<Club> => (await findClub()) ?? notFound())

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
