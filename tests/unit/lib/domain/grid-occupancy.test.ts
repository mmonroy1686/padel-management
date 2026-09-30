import { describe, expect, it } from 'vitest'
import { toOccupancy } from '@/lib/domain/grid'

const ROW = {
  id: 'blk',
  court_id: 'court-1',
  kind: 'block' as const,
  starts_at: '2026-10-01T13:00:00+00:00',
  ends_at: '2026-10-01T16:00:00+00:00',
  note: 'Clase de Pablo',
}

describe('toOccupancy', () => {
  it('keeps the tournament an occupancy belongs to', () => {
    expect(toOccupancy({ ...ROW, kind: 'tournament', tournament_id: 't1' }, 'player')).toMatchObject({
      kind: 'tournament',
      tournamentId: 't1',
    })
  })

  it('keeps the block reason for staff', () => {
    expect(toOccupancy(ROW, 'staff')).toEqual({
      id: 'blk',
      courtId: 'court-1',
      kind: 'block',
      note: 'Clase de Pablo',
      startsAt: new Date('2026-10-01T13:00:00Z'),
      endsAt: new Date('2026-10-01T16:00:00Z'),
    })
  })

  it('drops it for players, so staff notes never reach their browser', () => {
    expect(toOccupancy(ROW, 'player').note).toBeNull()
  })
})
