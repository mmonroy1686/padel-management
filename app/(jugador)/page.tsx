import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/logo'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getViewer } from '@/lib/auth/viewer'
import { loadDayGrid } from '@/lib/data/day'
import { dayLongLabel, timeIn } from '@/lib/domain/format'
import { countFree } from '@/lib/domain/grid'
import { categoryLabel, firstName, isProfileComplete, isStaffRole, SIDE_LABELS } from '@/lib/domain/profile'
import { localDateOf, toDate } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const viewer = await getViewer()
  if (!viewer) return <Landing />
  const { club, profile, membership } = viewer
  if (!membership || !isProfileComplete(profile, membership)) redirect('/bienvenida')

  const now = new Date()
  const supabase = await createClient()
  const [grid, next] = await Promise.all([
    loadDayGrid(club, localDateOf(now, club.timezone), { userId: viewer.userId, audience: 'player' }, now),
    supabase
      .from('bookings')
      .select('id, starts_at, ends_at, court:courts(name)')
      .eq('player_id', viewer.userId)
      .eq('status', 'confirmed')
      .gt('ends_at', now.toISOString())
      .order('starts_at')
      .limit(1)
      .maybeSingle(),
  ])
  if (next.error) throw next.error
  const freeToday = countFree(grid.rows)

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">Hola, {firstName(profile.display_name)}</h1>
        <p className="text-fg-muted">
          {categoryLabel(membership.category, membership.category_validated)}.
          {profile.side ? ` ${SIDE_LABELS[profile.side]}.` : ''}
        </p>
      </div>
      <Card className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase">Tu próxima reserva</h2>
        {next.data ? (
          <>
            <p>
              {dayLongLabel(localDateOf(toDate(next.data.starts_at), club.timezone))},{' '}
              {timeIn(toDate(next.data.starts_at), club.timezone)} a {timeIn(toDate(next.data.ends_at), club.timezone)},{' '}
              {next.data.court?.name}
            </p>
            <Link href="/reservas" className="font-semibold text-accent-ink underline">
              Ver mis reservas
            </Link>
          </>
        ) : (
          <p className="text-fg-muted">No tenés reservas.</p>
        )}
      </Card>
      <Link href="/reservar" className={buttonClasses({ fullWidth: true })}>
        {freeToday === 1 ? '1 turno libre hoy' : `${freeToday} turnos libres hoy`}
      </Link>
      {isStaffRole(membership.role) ? (
        <Link href="/club/grilla" className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
          Panel del club
        </Link>
      ) : null}
    </>
  )
}

function Landing() {
  return (
    <>
      <Logo className="size-16" />
      <h1 className="font-display text-4xl font-bold uppercase">Rustic Pádel</h1>
      <Card>
        <p className="mb-4 text-fg-muted">Reservá cancha y armá partido desde el celular.</p>
        <Link href="/auth/ingreso" className={buttonClasses({ fullWidth: true })}>
          Ingresar
        </Link>
      </Card>
    </>
  )
}
