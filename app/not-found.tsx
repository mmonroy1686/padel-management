import Link from 'next/link'
import { findClub } from '@/lib/auth/viewer'

// 404s: a page that does not exist, or a subdomain without a club ("Club no encontrado").
export default async function NotFound() {
  const club = await findClub()
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <h1 className="font-display text-4xl font-bold uppercase">{club ? 'Página no encontrada' : 'Club no encontrado'}</h1>
      <p className="text-fg-muted">
        {club
          ? 'Esta dirección no existe. Puede que el link esté incompleto o que lo hayan quitado.'
          : 'No hay ningún club en esta dirección. Revisá que el link esté bien escrito o pedile el link correcto a tu club.'}
      </p>
      {club ? (
        <Link href="/" className="font-semibold text-accent-ink underline">
          Ir al inicio de {club.name}
        </Link>
      ) : null}
    </main>
  )
}
