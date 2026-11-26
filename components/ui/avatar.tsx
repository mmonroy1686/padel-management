'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { avatarSrc, initialsOf, type ProfileAvatar } from '@/lib/domain/contact'
import { getSupabaseEnv } from '@/lib/supabase/env'

const SIZES = { sm: 'size-9 text-sm', md: 'size-12 text-base', lg: 'size-20 text-2xl' } as const

// A player's photo in a circle: the one they uploaded, their Google photo, or their initials. Decorative (empty alt):
// the name is always next to it. A photo that does not load (a Google link that expired) falls back to the initials.
export function Avatar({
  name,
  profile,
  size = 'md',
  className,
}: {
  name: string
  profile: ProfileAvatar | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const src = profile ? avatarSrc(profile, getSupabaseEnv().url) : null
  const [broken, setBroken] = useState<string | null>(null)
  const box = cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', SIZES[size], className)
  if (src && broken !== src) {
    return (
      // A plain img: the photo comes from Storage or Google, and next/image would need their hosts configured.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(src)} className={cn(box, 'object-cover')} />
    )
  }
  return (
    <span aria-hidden="true" data-initials className={cn(box, 'border border-border bg-surface font-semibold text-fg')}>
      {initialsOf(name)}
    </span>
  )
}
