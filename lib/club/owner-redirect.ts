import 'server-only'
import { redirect } from 'next/navigation'
import { requestOrigin } from '@/lib/auth/request-origin'
import { clubSlug } from '@/lib/auth/viewer'
import { clubUrl } from './host'

// A page that belongs to one club (a championship's public page) opened on another club's host: send it home, so it
// shows its own club's brand and links. Nothing to do without the owner's slug, when it is the host's club, or when the
// owner has no URL of its own yet (no root domain: every host is the default club, and redirecting would loop).
export async function redirectToOwnerClub(ownerSlug: string | null, path: string): Promise<void> {
  if (!ownerSlug || ownerSlug === (await clubSlug())) return
  const origin = await requestOrigin()
  const target = clubUrl(ownerSlug, process.env, origin)
  if (new URL(target).host === new URL(origin).host) return
  redirect(`${target}${path}`)
}
