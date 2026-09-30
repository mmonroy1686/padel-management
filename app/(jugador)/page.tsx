import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/logo'
import { MatchCard } from '@/components/matches/match-card'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getViewer } from '@/lib/auth/viewer'
import { loadDayGrid } from '@/lib/data/day'
import { loadFreeCourts, loadMatches, loadPlayerContext } from '@/lib/data/matches'
import { dayLabel, dayLongLabel, timeIn } from '@/lib/domain/format'
import { countFree } from '@/lib/domain/grid'
import { joinStatus } from '@/lib/domain/match-join'
import { riskOf } from '@/lib/domain/match-risk'
import { isInMatch, statusLabel } from '@/lib/domain/matches'
import { matchesForMe } from '@/lib/domain/matches-for-me'
import { categoryLabel, firstName, isProfileComplete, isStaffRole, SIDE_LABELS } from '@/lib/domain/profile'
import { addDays, localDateOf, toDate, zonedTime } from '@/lib/domain/time'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const viewer = await getViewer()
  if (!viewer) return <Landing />
  const { club, profile, membership } = viewer
  if (!membership || !isProfileComplete(profile, membership)) redirect('/bienvenida')

  const now = new Date()
  const supabase = await createClient()
  const member = { ...viewer, membership }
  const windowEnd = zonedTime(addDays(localDateOf(now, club.timezone), club.booking_window_days + 1), 0, club.timezone)
  const [grid, next, matches, context] = await Promise.all([
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
    loadMatches(club, { from: now, to: windowEnd }),
    loadPlayerContext(member, now),
  ])
  if (next.error) throw next.error
  const freeToday = countFree(grid.rows)
  const forMe = matchesForMe(
    matches.filter((match) => match.status === 'forming'),
    context.player,
    { now, closeHours: club.match_close_hours, busy: context.busy, timezone: club.timezone, habits: context.habits },
  )
  const myMatches = matches.filter((match) => isInMatch(match, viewer.userId)).slice(0, 3)
  const freeCourts = await loadFreeCourts(club, forMe.map((item) => item.match))
  const today = localDateOf(now, club.timezone)
  const whenText = (start: Date) => `${dayLabel(localDateOf(start, club.timezone), today)} ${timeIn(start, club.timezone)}`

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
      <Card className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase">Tu próximo partido</h2>
        {myMatches.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {myMatches.map((match) => (
              <li key={match.id}>
                <Link href={`/partidos/${match.id}`} className="font-semibold text-accent-ink underline">
                  {whenText(match.startsAt)}
                </Link>{' '}
                <span className="text-fg-muted">{statusLabel(match)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">No estás anotado en ningún partido.</p>
        )}
      </Card>
      <section aria-labelledby="para-vos" className="flex flex-col gap-3">
        <h2 id="para-vos" className="font-display text-2xl font-bold uppercase">
          Partidos para vos
        </h2>
        {forMe.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {forMe.map(({ match, reasons }) => (
              <li key={match.id}>
                <MatchCard
                  match={match}
                  viewerId={viewer.userId}
                  whenText={whenText(match.startsAt)}
                  status={joinStatus(match, context.player, { now, closeHours: club.match_close_hours, busy: context.busy })}
                  risk={riskOf(match, freeCourts.get(match.id) ?? [])}
                  reasons={reasons}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">
            Ahora no hay partidos armándose para tu categoría y lado.{' '}
            <Link href="/partidos" className="font-semibold text-accent-ink underline">
              Armá uno
            </Link>
            .
          </p>
        )}
      </section>
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
