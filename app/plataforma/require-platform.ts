import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth/viewer'
import { isPlatformAdmin } from '@/lib/data/platform'
import { isPlatformHost } from '@/lib/domain/platform'

// The platform: only on PLATFORM_HOST and for platform admins; anything else is a 404, so it never shows it exists.
export async function requirePlatform(path: string): Promise<void> {
  if (!isPlatformHost((await headers()).get('host'))) notFound()
  const viewer = await getViewer()
  if (!viewer) redirect(`/auth/ingreso?next=${encodeURIComponent(path)}`)
  if (!(await isPlatformAdmin())) notFound()
}
