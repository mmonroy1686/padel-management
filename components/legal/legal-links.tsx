import Link from 'next/link'
import { cn } from '@/lib/cn'

const LINK = 'font-semibold text-accent-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent'

// "Al continuar aceptás…": under the sign-in and the welcome form. As a plain footer (`footer`), just the two links.
export function LegalLinks({ footer = false, className }: { footer?: boolean; className?: string }) {
  if (footer) {
    return (
      <nav aria-label="Legales" className={cn('flex justify-center gap-4 text-xs text-fg-muted', className)}>
        <Link href="/terminos" className="underline underline-offset-2 hover:text-fg">
          Términos
        </Link>
        <Link href="/privacidad" className="underline underline-offset-2 hover:text-fg">
          Privacidad
        </Link>
      </nav>
    )
  }
  return (
    <p className={cn('text-sm text-fg-muted', className)}>
      Al continuar aceptás los{' '}
      <Link href="/terminos" className={LINK}>
        Términos y condiciones
      </Link>{' '}
      y la{' '}
      <Link href="/privacidad" className={LINK}>
        Política de privacidad
      </Link>
      .
    </p>
  )
}
