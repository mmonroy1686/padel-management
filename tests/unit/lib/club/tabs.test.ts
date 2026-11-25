import { describe, expect, it } from 'vitest'
import { clubBarTabs, clubMoreTabs, clubTabs } from '@/lib/club/tabs'

describe('clubTabs', () => {
  it('shows the day-to-day screens to reception', () => {
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual([
      'Inicio', 'Grilla', 'Asistente', 'Calendario', 'Torneos', 'Day use', 'Cobros', 'Jugadores',
    ])
  })

  it('adds the settings to admins', () => {
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual([
      '/club/inicio', '/club/grilla', '/club/asistente', '/club/calendario', '/club/torneos', '/club/day-use', '/club/cobros', '/club/jugadores', '/club/ajustes',
    ])
  })

  it('gives every tab an icon', () => {
    expect(clubTabs('admin').map((tab) => tab.icon)).toEqual(['home', 'grid', 'racket', 'calendar', 'trophy', 'ticket', 'cash', 'users', 'sliders'])
  })
})

describe('the phone bar and «Más»', () => {
  it('keeps Inicio, Grilla and Cobros in the bar; Ajustes for the admin, Jugadores for reception', () => {
    expect(clubBarTabs('admin').map((tab) => tab.label)).toEqual(['Inicio', 'Grilla', 'Cobros', 'Ajustes'])
    expect(clubBarTabs('reception').map((tab) => tab.label)).toEqual(['Inicio', 'Grilla', 'Cobros', 'Jugadores'])
  })

  it('puts every other section in «Más», each with what it is for', () => {
    expect(clubMoreTabs('admin').map((tab) => tab.label)).toEqual(['Asistente', 'Calendario', 'Torneos', 'Day use', 'Jugadores'])
    expect(clubMoreTabs('reception').map((tab) => tab.label)).toEqual(['Asistente', 'Calendario', 'Torneos', 'Day use'])
    expect(clubMoreTabs('admin').every((tab) => tab.description.length > 0)).toBe(true)
  })
})
