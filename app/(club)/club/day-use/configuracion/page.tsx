import type { Metadata } from 'next'
import { OverrideCalendar } from '@/components/day-use/override-calendar'
import { ProductForm } from '@/components/day-use/product-form'
import { ProductsTable } from '@/components/day-use/products-table'
import { BackLink } from '@/components/ui/back-link'
import { Card } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth/viewer'
import { loadDayUseOccupancies, loadOverrides, loadProducts } from '@/lib/data/day-use'
import { loadActiveCourts } from '@/lib/data/tournaments'
import { unblockedCourts } from '@/lib/domain/day-use'
import { dayLabel } from '@/lib/domain/format'
import { addDays, localDateOf, zonedTime } from '@/lib/domain/time'
import { saveDayUseProduct, setDayUseOverride, setProductActive } from '../actions'

export const metadata: Metadata = { title: 'Configurar day use' }

const CALENDAR_DAYS = 14

export default async function DayUseSettingsPage() {
  const viewer = await requireAdmin('/club/day-use/configuracion')
  const { club } = viewer
  const now = new Date()
  const today = localDateOf(now, club.timezone)
  const horizon = addDays(today, club.booking_window_days)
  const dates = Array.from({ length: club.booking_window_days + 1 }, (_, index) => addDays(today, index))
  const [products, overrides, courts, occupancies] = await Promise.all([
    loadProducts(club, { includeInactive: true }),
    loadOverrides(club, today, horizon),
    loadActiveCourts(club),
    loadDayUseOccupancies(club, now, zonedTime(addDays(horizon, 1), 0, club.timezone)),
  ])
  const active = products.filter((product) => product.isActive)
  const courtName = new Map(courts.map((court) => [court.id, court.name]))
  const productName = new Map(products.map((product) => [product.id, product.name]))
  const warnings = active.flatMap((product) => unblockedCourts(product, dates, overrides, occupancies, now, club.timezone))
  const calendarDays = dates.slice(0, CALENDAR_DAYS).map((date) => ({ date, label: dayLabel(date, today) }))

  return (
    <>
      <BackLink href="/club/day-use">Volver a day use</BackLink>
      <h2 className="font-display text-2xl font-bold uppercase">Configurar day use</h2>

      {warnings.length > 0 ? (
        <section aria-labelledby="sin-bloquear" className="flex flex-col gap-2 rounded-2xl border border-danger p-4">
          <h3 id="sin-bloquear" className="font-display text-xl font-bold uppercase text-danger">
            Canchas sin bloquear
          </h3>
          <p className="text-sm">
            Ya estaban ocupadas cuando se guardó el pase. Liberalas en la grilla y volvé a guardar el pase para bloquearlas.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {warnings.map((warning) => (
              <li key={`${warning.productId}-${warning.date}-${warning.courtId}`}>
                {productName.get(warning.productId)}: {courtName.get(warning.courtId) ?? 'una cancha inactiva'}, {dayLabel(warning.date, today)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {active.length > 0 ? (
        <section aria-labelledby="calendario" className="flex flex-col gap-3">
          <h3 id="calendario" className="font-display text-xl font-bold uppercase">
            Calendario
          </h3>
          <OverrideCalendar products={active} days={calendarDays} overrides={overrides} action={setDayUseOverride} />
        </section>
      ) : null}

      {products.length > 0 ? (
        <section aria-labelledby="pases" className="flex flex-col gap-3">
          <h3 id="pases" className="font-display text-xl font-bold uppercase">
            Pases
          </h3>
          <ProductsTable products={products} courts={courts} saveAction={saveDayUseProduct} activeAction={setProductActive} />
        </section>
      ) : null}

      <section aria-labelledby="nuevo-pase" className="flex flex-col gap-3">
        <h3 id="nuevo-pase" className="font-display text-xl font-bold uppercase">
          Nuevo pase
        </h3>
        <Card>
          <ProductForm product={null} courts={courts} action={saveDayUseProduct} idPrefix="nuevo" />
        </Card>
      </section>
    </>
  )
}
