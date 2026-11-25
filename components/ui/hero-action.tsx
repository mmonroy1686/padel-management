import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icon'

// The one thing a screen is for, first and big: the whole block is the link. Only one per screen; everything
// else on the page stays secondary.
export function HeroAction({ href, icon, title, detail }: { href: string; icon: IconName; title: string; detail?: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-20 items-center gap-4 rounded-2xl bg-accent px-5 py-4 text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon name={icon} className="size-7" />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-2xl font-bold uppercase leading-tight">{title}</span>
        {/* Keeps title and detail apart in the link's accessible name. */}
        {detail ? <span className="sr-only">, </span> : null}
        {detail ? <span className="block font-semibold">{detail}</span> : null}
      </span>
      <Icon name="chevron-right" className="size-6" />
    </Link>
  )
}
