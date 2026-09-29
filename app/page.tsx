import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-10">
      <Logo className="size-16" />
      <h1 className="font-display text-4xl font-bold uppercase">Rustic Pádel</h1>
      <Card>
        {user ? (
          <p>
            Sesión iniciada como <strong>{user.email}</strong>.
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
    </main>
  )
}
