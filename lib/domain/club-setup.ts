import type { Role } from './profile'

// The setup assistant of a new club (/club/alta/<paso>): the forms of Ajustes, one per step, in the order a club needs
// them. An operating club has at least one active court and one price (finish_club_setup checks it again).

export const SETUP_STEPS = [
  { key: 'canchas', title: 'Canchas', description: 'Las canchas que se reservan. Después se pueden editar o desactivar.' },
  { key: 'horario', title: 'Horario y turno', description: 'A qué hora abre y cierra el club y cuánto dura cada turno.' },
  {
    key: 'precios',
    title: 'Precios por franja',
    description: 'El precio de un turno sale de la franja que cubre su hora de inicio. Un turno sin franja no se ofrece.',
  },
  { key: 'cobros', title: 'Cobros', description: 'Cómo te pagan los jugadores, y los datos para transferir.' },
  { key: 'marca', title: 'Logo y colores', description: 'Se ven en toda la app, en los mails y al compartir links.' },
  { key: 'recepcion', title: 'Invitar recepción', description: 'Quien atiende el club: le llega un mail para entrar al panel.' },
] as const

export type SetupStep = (typeof SETUP_STEPS)[number]['key']

export function isSetupStep(value: string): value is SetupStep {
  return SETUP_STEPS.some((step) => step.key === value)
}

function indexOf(step: SetupStep): number {
  return SETUP_STEPS.findIndex((item) => item.key === step)
}

export function nextStep(step: SetupStep): SetupStep | null {
  return SETUP_STEPS[indexOf(step) + 1]?.key ?? null
}

export function setupProgress(step: SetupStep): string {
  return `Paso ${indexOf(step) + 1} de ${SETUP_STEPS.length}`
}

// What "Listo" still needs, with the step that adds it.
export function missingForSetup(club: { activeCourts: number; priceRules: number }): { step: SetupStep; text: string }[] {
  const missing: { step: SetupStep; text: string }[] = []
  if (club.activeCourts === 0) missing.push({ step: 'canchas', text: 'Agregá al menos una cancha.' })
  if (club.priceRules === 0) missing.push({ step: 'precios', text: 'Cargá al menos un precio por franja.' })
  return missing
}

// The panel sends the admin of a club that is not set up and has no courts to the assistant, unless they chose
// "Terminar después" (then Inicio shows how to come back).
export function shouldOpenSetup(viewer: { role: Role; setupCompleted: boolean; activeCourts: number; later: boolean }): boolean {
  return viewer.role === 'admin' && !viewer.setupCompleted && viewer.activeCourts === 0 && !viewer.later
}
