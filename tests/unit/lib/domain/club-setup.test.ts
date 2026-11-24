import { describe, expect, it } from 'vitest'
import { isSetupStep, missingForSetup, nextStep, SETUP_STEPS, setupProgress, shouldOpenSetup } from '@/lib/domain/club-setup'

describe('SETUP_STEPS', () => {
  it('goes from the courts to inviting reception', () => {
    expect(SETUP_STEPS.map((step) => step.key)).toEqual(['canchas', 'horario', 'precios', 'cobros', 'marca', 'recepcion'])
    expect(SETUP_STEPS.map((step) => step.title)).toEqual([
      'Canchas',
      'Horario y turno',
      'Precios por franja',
      'Cobros',
      'Logo y colores',
      'Invitar recepción',
    ])
  })

  it('knows its steps, the next one and where each one is', () => {
    expect(isSetupStep('precios')).toBe(true)
    expect(isSetupStep('otra')).toBe(false)
    expect(nextStep('canchas')).toBe('horario')
    expect(nextStep('recepcion')).toBeNull()
    expect(setupProgress('precios')).toBe('Paso 3 de 6')
  })
})

describe('missingForSetup', () => {
  it('needs an active court and a price, and says where to add them', () => {
    expect(missingForSetup({ activeCourts: 0, priceRules: 0 })).toEqual([
      { step: 'canchas', text: 'Agregá al menos una cancha.' },
      { step: 'precios', text: 'Cargá al menos un precio por franja.' },
    ])
    expect(missingForSetup({ activeCourts: 2, priceRules: 0 })).toEqual([
      { step: 'precios', text: 'Cargá al menos un precio por franja.' },
    ])
    expect(missingForSetup({ activeCourts: 1, priceRules: 1 })).toEqual([])
  })
})

describe('shouldOpenSetup', () => {
  it("opens the assistant for an admin of a new club without courts, unless they said they'd finish later", () => {
    const fresh = { role: 'admin' as const, setupCompleted: false, activeCourts: 0, later: false }
    expect(shouldOpenSetup(fresh)).toBe(true)
    expect(shouldOpenSetup({ ...fresh, later: true })).toBe(false)
    expect(shouldOpenSetup({ ...fresh, activeCourts: 1 })).toBe(false)
    expect(shouldOpenSetup({ ...fresh, setupCompleted: true })).toBe(false)
    expect(shouldOpenSetup({ ...fresh, role: 'reception' })).toBe(false)
  })
})
