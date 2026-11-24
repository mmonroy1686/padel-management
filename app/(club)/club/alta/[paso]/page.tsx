import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BrandForm } from '@/components/club/brand-form'
import { LogoForm } from '@/components/club/logo-form'
import { ActionForm } from '@/components/ui/action-form'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireAdmin, type Club } from '@/lib/auth/viewer'
import { loadCourtsAndPrices, loadSetupState } from '@/lib/data/club-setup'
import { isSetupStep, missingForSetup, nextStep, SETUP_STEPS, setupProgress, type SetupStep } from '@/lib/domain/club-setup'
import { removeClubLogo, saveClubBrand, saveClubLogo } from '../../ajustes/actions'
import { BookingRulesForm, CourtsEditor, InviteStaffForm, PaymentsForm, PricesEditor } from '../../ajustes/forms'
import { finishSetup } from '../actions'

export const metadata: Metadata = { title: 'Configurar el club' }

type Params = Promise<{ paso: string }>

async function StepForm({ step, club }: { step: SetupStep; club: Club }) {
  switch (step) {
    case 'canchas':
      return <CourtsEditor courts={(await loadCourtsAndPrices(club.id)).courts} />
    case 'horario':
      return (
        <Card>
          <BookingRulesForm club={club} />
        </Card>
      )
    case 'precios':
      return <PricesEditor rules={(await loadCourtsAndPrices(club.id)).rules} />
    case 'cobros':
      return (
        <Card>
          <PaymentsForm club={club} />
        </Card>
      )
    case 'marca':
      return (
        <div className="flex flex-col gap-4">
          <Card>
            <LogoForm club={club} saveAction={saveClubLogo} removeAction={removeClubLogo} />
          </Card>
          <Card>
            <BrandForm club={club} action={saveClubBrand} />
          </Card>
        </div>
      )
    case 'recepcion':
      return (
        <Card>
          <InviteStaffForm />
        </Card>
      )
  }
}

// The setup assistant of a new club: one form of Ajustes per step, each saved on its own; "Siguiente" or skipping
// moves on, "Terminar después" goes to the panel, and the last step's "Listo" finishes (with a court and a price).
export default async function SetupStepPage({ params }: { params: Params }) {
  const { paso } = await params
  if (!isSetupStep(paso)) notFound()
  const { club } = await requireAdmin(`/club/alta/${paso}`)
  const current = SETUP_STEPS.find((step) => step.key === paso) ?? SETUP_STEPS[0]
  const next = nextStep(paso)
  const missing = next ? [] : missingForSetup(await loadSetupState(club.id))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-muted">Configurar {club.name} · {setupProgress(paso)}</p>
        <ol className="flex flex-wrap gap-2" aria-label="Pasos">
          {SETUP_STEPS.map((step) => (
            <li key={step.key}>
              <Link
                href={`/club/alta/${step.key}`}
                aria-current={step.key === paso ? 'step' : undefined}
                className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm aria-[current=step]:border-accent aria-[current=step]:font-semibold"
              >
                {step.title}
              </Link>
            </li>
          ))}
        </ol>
        <h1 className="font-display text-3xl font-bold uppercase">{current.title}</h1>
        <p className="text-fg-muted">{current.description}</p>
      </div>

      <StepForm step={paso} club={club} />

      {next ? (
        <nav aria-label="Seguir" className="flex flex-wrap items-center gap-3">
          <Link href={`/club/alta/${next}`} className={buttonClasses()}>
            Siguiente: {SETUP_STEPS.find((step) => step.key === next)?.title}
          </Link>
          <Link href="/club/inicio?alta=despues" className="min-h-11 content-center text-sm underline underline-offset-4">
            Terminar después
          </Link>
        </nav>
      ) : (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">¿Listo?</h2>
          {missing.length > 0 ? (
            <ul className="flex flex-col gap-1" aria-label="Falta para terminar">
              {missing.map((item) => (
                <li key={item.step}>
                  {item.text}{' '}
                  <Link href={`/club/alta/${item.step}`} className="underline underline-offset-4">
                    Ir a {SETUP_STEPS.find((step) => step.key === item.step)?.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted">El club ya se puede reservar. Todo lo de estos pasos se cambia después en Ajustes.</p>
          )}
          <ActionForm action={finishSetup} submitLabel="Listo, ir al panel" pendingLabel="Terminando…" />
          <Link href="/club/inicio?alta=despues" className="min-h-11 content-center text-sm underline underline-offset-4">
            Terminar después
          </Link>
        </Card>
      )}
    </div>
  )
}
