import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getViewer } from '@/lib/auth/viewer'

export default async function HomePage() {
  const viewer = await getViewer()

  return (
    <>
      <Logo className="size-16" />
      <h1 className="font-display text-4xl font-bold uppercase">Rustic Pádel</h1>
      <Card>
        {viewer ? (
          <p>
            Sesión iniciada como <strong>{viewer.email}</strong>.
          </p>
        ) : (
          <>
            <p className="mb-4 text-fg-muted">Reservá cancha y armá partido desde el celular.</p>
            <Link href="/auth/ingreso" className={buttonClasses({ fullWidth: true })}>
              Ingresar
            </Link>
          </>
        )}
      </Card>
    </>
  )
}
