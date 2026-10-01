import { cn } from '@/lib/cn'
import { clubLogoUrl } from '@/lib/domain/club-logo'
import { getSupabaseEnv } from '@/lib/supabase/env'
import { Logo } from './logo'

type ClubLogoProps = { club: { name: string; logo_path: string | null }; className?: string }

// The logo the admin uploaded in Ajustes, or the placeholder until there is one.
export function ClubLogo({ club, className }: ClubLogoProps) {
  const url = clubLogoUrl(getSupabaseEnv().url, club.logo_path)
  if (!url) return <Logo className={className} />
  // A plain img: the logo comes from Supabase Storage and next/image would need its host configured.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={club.name} className={cn('object-contain', className)} />
}
