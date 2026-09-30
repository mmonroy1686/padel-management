import type { Metadata } from 'next'
import Link from 'next/link'
import { OverrideCalendar } from '@/components/day-use/override-calendar'
import { ProductForm } from '@/components/day-use/product-form'
import { ActionForm } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth/viewer'
import { loadDayUseOccupancies, loadOverrides, loadProducts } from '@/lib/data/day-use'
import { loadActiveCourts } from '@/lib/data/tournaments'
import { scheduleText, unblockedCourts } from '@/lib/domain/day-use'
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
      <Link href="/club/day-use" className="text-sm font-semibold text-accent-ink underline">
        Volver a day use
      </Link>
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
          <ul className="grid gap-3 md:grid-cols-2">
            {products.map((product) => (
              <li key={product.id}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{product.name}</p>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
                      {product.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <p className="text-sm text-fg-muted">{scheduleText(product)}</p>
                  <ProductForm product={product} courts={courts} action={saveDayUseProduct} idPrefix={`pase-${product.id}`} />
                  <ActionForm
                    action={setProductActive}
                    submitLabel={product.isActive ? 'Desactivar' : 'Activar'}
                    pendingLabel="Guardando…"
                    variant="ghost"
                  >
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="active" value={String(!product.isActive)} />
                  </ActionForm>
                </Card>
              </li>
            ))}
          </ul>
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
