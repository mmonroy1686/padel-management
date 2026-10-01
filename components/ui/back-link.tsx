import Link from 'next/link'

// "Volver a …" above a detail screen: a text link with a full-size tap area.
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start px-1 text-sm font-semibold text-accent-ink underline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span aria-hidden="true">‹</span>
      {children}
    </Link>
  )
}
