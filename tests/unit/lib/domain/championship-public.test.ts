import { describe, expect, it } from 'vitest'
import { isPublicCode, readPublicChampionship } from '@/lib/domain/championship-public'
import { pairName } from '@/lib/domain/championships'

const DATA = {
  club: { name: 'Rustic Pádel', logo_path: null, timezone: 'America/Montevideo' },
  championship: {
    id: 'ch1',
    name: 'Copa de Primavera',
    rules: 'Al mejor de 3 sets.',
    status: 'in_progress',
    public_code: 'copa-de-primavera-7k2f',
    poster_path: null,
  },
  windows: [{ id: 'w1', on_date: '2026-10-17', from_time: '08:00:00', to_time: '14:00:00', court_ids: ['court-1'] }],
  courts: [{ id: 'court-1', name: 'Cancha 1' }],
  categories: [
    {
      id: 'k1',
      name: '6ta Libre',
      gender: 'open',
      format: 'groups_knockout',
      group_size: 4,
      qualifiers_per_group: 2,
      match_minutes: 90,
      match_rules: { third_set: 'super_tiebreak' },
      sort_order: 0,
      entries: [
        { id: 'e1', player1_name: 'Ana', player2_name: 'Pedro' },
        { id: 'e2', player1_name: 'Bruno', player2_name: 'Lucía' },
      ],
    },
  ],
  groups: [
    {
      id: 'g1',
      category_id: 'k1',
      name: 'Zona A',
      sort_order: 0,
      members: [
        { entry_id: 'e1', draw_position: 1, place: null },
        { entry_id: 'e2', draw_position: 2, place: null },
      ],
    },
  ],
  matches: [
    {
      id: 'm1',
      category_id: 'k1',
      stage: 'group',
      group_id: 'g1',
      round: null,
      bracket_position: null,
      entry_a_id: 'e1',
      entry_b_id: 'e2',
      source_a: null,
      source_b: null,
      court_id: 'court-1',
      starts_at: '2026-10-17T11:00:00+00:00',
      ends_at: '2026-10-17T12:30:00+00:00',
      pinned: false,
      status: 'playing',
      winner_entry_id: null,
      walkover_entry_id: null,
      sets: [],
    },
  ],
}

describe('readPublicChampionship', () => {
  it('reads what public_championship returns', () => {
    const data = readPublicChampionship(DATA)
    expect(data).toMatchObject({
      clubName: 'Rustic Pádel',
      logoPath: null,
      timezone: 'America/Montevideo',
      code: 'copa-de-primavera-7k2f',
      courts: [{ id: 'court-1', name: 'Cancha 1' }],
    })
    expect(data?.championship.name).toBe('Copa de Primavera')
    expect(data?.championship.categories[0].entries.map(pairName)).toEqual(['Ana y Pedro', 'Bruno y Lucía'])
    expect(data?.championship.categories[0].thirdSet).toBe('super_tiebreak')
    expect(data?.fixture.matches[0]).toMatchObject({ id: 'm1', status: 'playing', courtId: 'court-1' })
    expect(data?.fixture.groups[0].members.map((member) => member.entryId)).toEqual(['e1', 'e2'])
  })

  it('reads nothing when the link leads nowhere', () => {
    expect(readPublicChampionship(null)).toBeNull()
    expect(readPublicChampionship({ club: {} })).toBeNull()
  })
})

describe('isPublicCode', () => {
  it('takes only codes like the ones the database makes', () => {
    expect(isPublicCode('copa-de-primavera-7k2f')).toBe(true)
    expect(isPublicCode('Copa')).toBe(false)
    expect(isPublicCode('a')).toBe(false)
    expect(isPublicCode('copa--7k2f')).toBe(false)
  })
})
