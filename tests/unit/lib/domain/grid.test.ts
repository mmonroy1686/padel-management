import { describe, expect, it } from 'vitest'
import { blockEndOptions, countFree, dayStats, holderName, visibleRows } from '@/lib/domain/grid'
import { at, booking, makeGrid, occupancy } from '../../fixtures/grid'
import { makeMatch } from '../../fixtures/matches'

describe('buildDayGrid', () => {
  it('offers every future slot on every court, with its price', () => {
    const grid = makeGrid()
    expect(grid.rows).toHaveLength(10)
    expect(grid.rows[0].cells.map((cell) => [cell.state, cell.price])).toEqual([['free', 1200], ['free', 1200]])
    expect(grid.rows[7].cells[0].price).toBe(1600)
  })

  it('shows an occupancy as taken and the viewer\'s own booking as mine', () => {
    const grid = makeGrid({
      occupancies: [occupancy('o1', 'court-1', '08:00', '09:30'), occupancy('o2', 'court-2', '08:00', '09:30')],
      bookings: [booking('o2', { isMine: true })],
    })
    expect(grid.rows[0].cells.map((cell) => cell.state)).toEqual(['taken', 'mine'])
    expect(grid.rows[0].cells[1].booking?.id).toBe('b-o2')
  })

  it('marks slots that already started as past', () => {
    const grid = makeGrid({ now: at('09:30') })
    expect(grid.rows.slice(0, 3).map((row) => row.past)).toEqual([true, true, false])
    expect(grid.rows[0].cells[0].state).toBe('past')
  })

  it('covers every slot a long block touches, without calling it off the grid', () => {
    const grid = makeGrid({ occupancies: [occupancy('blk', 'court-1', '09:30', '12:30', 'block', 'Clase')] })
    expect(grid.rows.slice(0, 4).map((row) => row.cells[0].state)).toEqual(['free', 'taken', 'taken', 'free'])
    expect(grid.rows[1].cells[0].offGrid).toBe(false)
  })

  it('flags a booking that no longer matches the grid', () => {
    const grid = makeGrid({ occupancies: [occupancy('o1', 'court-1', '08:30', '10:00')] })
    expect(grid.rows[0].cells[0].offGrid).toBe(true)
    expect(grid.rows[1].cells[0].offGrid).toBe(true)
  })

  it('lists occupancies that fall outside every slot', () => {
    const grid = makeGrid({ occupancies: [occupancy('late', 'court-1', '23:00', '23:59')] })
    expect(grid.outside.map((o) => o.id)).toEqual(['late'])
  })

  it('does not offer slots without a price', () => {
    const grid = makeGrid({ rules: [] })
    expect(grid.rows[0].cells[0]).toMatchObject({ state: 'no_price', price: null })
  })
})

describe('visibleRows', () => {
  it('hides past rows unless asked', () => {
    const grid = makeGrid({ now: at('10:00') })
    expect(visibleRows(grid.rows, { onlyFree: false, showPast: false })).toHaveLength(8)
    expect(visibleRows(grid.rows, { onlyFree: false, showPast: true })).toHaveLength(10)
  })

  it('keeps only rows with a free court when filtering', () => {
    const grid = makeGrid({
      occupancies: [occupancy('o1', 'court-1', '08:00', '09:30'), occupancy('o2', 'court-2', '08:00', '09:30')],
    })
    expect(visibleRows(grid.rows, { onlyFree: true, showPast: false })[0].slot.label).toBe('09:30')
  })
})

describe('countFree', () => {
  it('counts free cells', () => {
    expect(countFree(makeGrid().rows)).toBe(20)
    expect(countFree(makeGrid({ now: at('21:00') }).rows)).toBe(2)
  })
})

describe('dayStats', () => {
  it('computes occupancy over every cell and revenue from distinct bookings', () => {
    const grid = makeGrid({
      occupancies: [occupancy('o1', 'court-1', '08:00', '09:30'), occupancy('blk', 'court-2', '08:00', '11:00', 'block')],
      bookings: [booking('o1', { price: 1200 })],
    })
    expect(dayStats(grid)).toEqual({ occupancyPercent: 15, revenue: 1200 })
  })
})

describe('blockEndOptions', () => {
  it('offers every end time until the next occupancy on that court', () => {
    const grid = makeGrid({ occupancies: [occupancy('o1', 'court-1', '12:30', '14:00')] })
    const options = blockEndOptions(grid.rows, grid.rows[0].cells[0])
    expect(options.map((option) => option.label)).toEqual(['09:30', '11:00', '12:30'])
    expect(options[0].value).toBe(at('09:30').toISOString())
  })
})

describe('holderName', () => {
  it('prefers the name reception typed, then the player\'s name', () => {
    expect(holderName('Rodríguez', 'Ana')).toBe('Rodríguez')
    expect(holderName(null, 'Ana')).toBe('Ana')
    expect(holderName(null, null)).toBeNull()
  })
})

describe('forming matches on the grid', () => {
  const at20 = (grid: ReturnType<typeof makeGrid>) => grid.rows.find((row) => row.slot.label === '20:00')

  it('marks the free cell of the preferred court and slot, which stays free', () => {
    const row = at20(makeGrid({ matches: [makeMatch()] }))
    expect(row?.cells.map((cell) => cell.formingMatch ?? null)).toEqual([{ id: 'm1', filled: 1 }, null])
    expect(row?.cells[0].state).toBe('free')
  })

  it('leaves out taken cells and matches that already hold a court', () => {
    const taken = makeGrid({ matches: [makeMatch()], occupancies: [occupancy('o1', 'court-1', '20:00', '21:30')] })
    expect(at20(taken)?.cells[0].formingMatch ?? null).toBeNull()
    const held = makeGrid({ matches: [makeMatch({ bookingId: 'b1' })] })
    expect(at20(held)?.cells[0].formingMatch ?? null).toBeNull()
  })

  it('keeps the matches of the day for the club panel', () => {
    expect(makeGrid({ matches: [makeMatch()] }).matches.map((match) => match.id)).toEqual(['m1'])
  })
})
