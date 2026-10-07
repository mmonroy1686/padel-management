import { describe, expect, it } from 'vitest'
import { championshipTabs, defaultTab, pickTab, TAB_LABELS } from '@/lib/domain/championship-tabs'
import { CHAMPIONSHIP_STATUSES } from '@/lib/domain/championships'

describe('championship tabs', () => {
  it('offers only the tabs that fit the state, in order', () => {
    expect(championshipTabs('draft')).toEqual(['ajustes'])
    expect(championshipTabs('registration')).toEqual(['parejas', 'ajustes'])
    expect(championshipTabs('closed')).toEqual(['fixture', 'parejas', 'ajustes'])
    expect(championshipTabs('drawn')).toEqual(['fixture', 'zonas', 'parejas', 'ajustes'])
    expect(championshipTabs('in_progress')).toEqual(['hoy', 'fixture', 'zonas', 'parejas', 'ajustes'])
    expect(championshipTabs('finished')).toEqual(['fixture', 'zonas', 'parejas'])
    expect(championshipTabs('in_progress').map((tab) => TAB_LABELS[tab])).toEqual([
      'Hoy',
      'Fixture',
      'Zonas y llaves',
      'Parejas',
      'Ajustes',
    ])
  })

  it('opens the tab the state calls for, always one it offers', () => {
    expect(CHAMPIONSHIP_STATUSES.map((status) => defaultTab(status))).toEqual([
      'ajustes',
      'parejas',
      'fixture',
      'fixture',
      'hoy',
      'hoy',
      'zonas',
      'parejas',
    ])
    expect(CHAMPIONSHIP_STATUSES.every((status) => championshipTabs(status).includes(defaultTab(status)))).toBe(true)
  })

  it('keeps the tab asked for only when it fits', () => {
    expect(pickTab('published', 'zonas')).toBe('zonas')
    expect(pickTab('registration', 'hoy')).toBe('parejas')
    expect(pickTab('published', undefined)).toBe('hoy')
    expect(pickTab('drawn', 'nada')).toBe('fixture')
  })
})
