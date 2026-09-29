import { describe, expect, it } from 'vitest'
import { clubTabs } from '@/lib/club/tabs'

describe('clubTabs', () => {
  it('shows the day-to-day screens to reception', () => {
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual(['Grilla', 'Calendario', 'Cobros', 'Jugadores'])
  })

  it('adds the settings to admins', () => {
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual([
      '/club/grilla', '/club/calendario', '/club/cobros', '/club/jugadores', '/club/ajustes',
    ])
  })
})
