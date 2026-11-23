import Link from 'next/link'
import type { ReactNode } from 'react'
import { BackButton } from '@/components/nav/back-button'
import type { Club } from '@/lib/auth/viewer'
import { ClubLogo } from './club-logo'

// "Volver", the club's logo and name on top of every player screen; children go on the right (the bell).
export function ClubHeader({ club, children }: { club: Pick<Club, 'name' | 'logo_path'>; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-3 px-4 md:max-w-3xl md:px-6 lg:max-w-5xl">
        <div className="flex min-w-0 items-center gap-1">
          <BackButton className="-ml-2" />
          <Link href="/" className="inline-flex min-h-11 min-w-0 items-center gap-3 font-display text-xl font-bold uppercase">
            <ClubLogo club={club} className="size-9 shrink-0" />
            <span className="truncate">{club.name}</span>
          </Link>
        </div>
        {children}
      </div>
    </header>
  )
}
