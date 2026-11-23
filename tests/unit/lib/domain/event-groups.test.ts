import { describe, expect, it } from 'vitest'
import {
  CHAMPIONSHIP_GROUPS,
  championshipNextStep,
  groupEvents,
  TOURNAMENT_GROUPS,
  type EventRow,
} from '@/lib/domain/event-groups'

const row = (id: string, status: string, at: number): EventRow => ({
  id,
  name: `Evento ${id}`,
  when: '',
  at,
  status,
  statusLabel: status,
  people: '',
  href: `/x/${id}`,
})

describe('groupEvents', () => {
  it('groups championships by stage, active first, and drops the empty groups', () => {
    const groups = groupEvents(
      [row('a', 'finished', 1), row('b', 'registration', 5), row('c', 'drawn', 3), row('d', 'in_progress', 2), row('e', 'closed', 1)],
      CHAMPIONSHIP_GROUPS,
    )
    expect(groups.map((group) => [group.title, group.rows.map((item) => item.id)])).toEqual([
      ['En juego', ['d']],
      ['Inscripción abierta', ['b']],
      ['Armando el fixture', ['e', 'c']],
      ['Terminados y cancelados', ['a']],
    ])
  })

  it('folds the finished and cancelled ones, latest first', () => {
    const groups = groupEvents([row('a', 'finished', 1), row('b', 'cancelled', 9), row('c', 'finished', 5)], CHAMPIONSHIP_GROUPS)
    expect(groups).toEqual([expect.objectContaining({ folded: true })])
    expect(groups[0].rows.map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })

  it('groups americanos in their own stages', () => {
    const groups = groupEvents([row('a', 'closed', 1), row('b', 'registration', 1), row('c', 'cancelled', 1)], TOURNAMENT_GROUPS)
    expect(groups.map((group) => group.title)).toEqual(['Inscripción abierta', 'Inscripción cerrada', 'Terminados y cancelados'])
  })

  it('has nothing to show without events', () => {
    expect(groupEvents([], CHAMPIONSHIP_GROUPS)).toEqual([])
  })
})

describe('championshipNextStep', () => {
  it('says what comes next until the fixture is out', () => {
    expect(championshipNextStep('draft')).toBe('Siguiente: abrir la inscripción')
    expect(championshipNextStep('registration')).toBe('Siguiente: cerrar la inscripción')
    expect(championshipNextStep('closed')).toBe('Siguiente: sortear')
    expect(championshipNextStep('drawn')).toBe('Siguiente: programar y publicar el fixture')
    expect(championshipNextStep('published')).toBe('Fixture publicado')
    expect(championshipNextStep('in_progress')).toBeNull()
    expect(championshipNextStep('finished')).toBeNull()
  })
})
