'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Avatar } from '@/components/ui/avatar'
import type { ProfileAvatar } from '@/lib/domain/contact'
import { signOut } from '@/lib/actions/profile'

export type AccountLink = { href: string; label: string }

const ITEM =
  'flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold hover:bg-surface focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-accent'

// The viewer's photo on top of every screen, player app and club panel alike: it opens their account, so signing
// out is two taps from anywhere. A menu button: Enter, Space or the arrows open it, the arrows move, Escape or a
// click outside close it.
export function AccountMenu({ name, profile, links }: { name: string; profile: ProfileAvatar | null; links: AccountLink[] }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const items = () => [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    items()[0]?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Tu cuenta"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className="inline-flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Avatar name={name} profile={profile} size="sm" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Tu cuenta"
          onKeyDown={(event) => {
            const list = items()
            const index = list.indexOf(document.activeElement as HTMLElement)
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const next = index + (event.key === 'ArrowDown' ? 1 : -1)
              list[(next + list.length) % list.length]?.focus()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              close(true)
            } else if (event.key === 'Tab') {
              close(false)
            }
          }}
          className="menu-pop absolute right-0 z-40 mt-1 flex w-60 flex-col rounded-xl border border-border bg-bg p-1 shadow-lg"
        >
          <p className="truncate px-3 pb-2 pt-2 text-sm text-fg-muted">{name}</p>
          {links.map((link) => (
            <Link key={link.href} href={link.href} role="menuitem" onClick={() => close(false)} className={`${ITEM} text-fg`}>
              {link.label}
            </Link>
          ))}
          <form action={signOut} className="mt-1 border-t border-border pt-1">
            <SignOutItem />
          </form>
        </div>
      ) : null}
    </div>
  )
}

function SignOutItem() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" role="menuitem" disabled={pending} className={`${ITEM} text-danger disabled:opacity-60`}>
      {pending ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  )
}
