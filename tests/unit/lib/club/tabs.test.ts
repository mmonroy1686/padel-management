import { describe, expect, it } from 'vitest'
import { clubTabs } from '@/lib/club/tabs'

describe('clubTabs', () => {
  it('shows the day-to-day screens to reception', () => {
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual([
      'Grilla', 'Calendario', 'Torneos', 'Day use', 'Cobros', 'Jugadores',
    ])
  })

  it('adds the settings to admins', () => {
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual([
      '/club/grilla', '/club/calendario', '/club/torneos', '/club/day-use', '/club/cobros', '/club/jugadores', '/club/ajustes',
    ])
  })

  it('gives every tab an icon', () => {
    expect(clubTabs('admin').map((tab) => tab.icon)).toEqual(['grid', 'calendar', 'trophy', 'ticket', 'cash', 'users', 'sliders'])
  })
})
