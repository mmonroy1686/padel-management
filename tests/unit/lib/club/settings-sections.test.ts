import { describe, expect, it } from 'vitest'
import { currentSection, sectionOf, SETTINGS_SECTIONS } from '@/lib/club/settings-sections'

describe('settings sections', () => {
  it('groups Ajustes from the club to what it charges, monitoring last', () => {
    expect(SETTINGS_SECTIONS.map((section) => section.label)).toEqual([
      'Club',
      'Datos del club',
      'Reservas y partidos',
      'Canchas y precios',
      'Pagos',
      'Sellos',
      'Flyer',
      'Staff',
      'Monitoreo',
    ])
  })

  it('knows where you are; the index itself is no section', () => {
    expect(currentSection('/club/ajustes')).toBeUndefined()
    expect(currentSection('/club/ajustes/club')?.label).toBe('Club')
    expect(currentSection('/club/ajustes/pagos')?.label).toBe('Pagos')
    expect(currentSection('/club/ajustes/otra')).toBeUndefined()
  })

  it('finds a section by its link', () => {
    expect(sectionOf('/club/ajustes/flyer').label).toBe('Flyer')
    expect(() => sectionOf('/club/ajustes/nada')).toThrow()
  })
})
