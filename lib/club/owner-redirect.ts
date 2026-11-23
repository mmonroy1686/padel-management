import 'server-only'
import { redirect } from 'next/navigation'
import { requestOrigin } from '@/lib/auth/request-origin'
import { clubSlug } from '@/lib/auth/viewer'
import { clubUrl } from './host'

// A page that belongs to one club (a championship's public page) opened on another club's host: send it home, so it
// shows its own club's brand and links. Nothing to do without the owner's slug or when it is the host's club.
export async function redirectToOwnerClub(ownerSlug: string | null, path: string): Promise<void> {
  if (!ownerSlug || ownerSlug === (await clubSlug())) return
  redirect(`${clubUrl(ownerSlug, process.env, await requestOrigin())}${path}`)
}
