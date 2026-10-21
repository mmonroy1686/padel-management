import { describe, expect, it } from 'vitest'
import {
  competitionsToday,
  courtItems,
  homeSections,
  playerLabel,
  timeLeft,
  todayLines,
  transfersLine,
  turnPlayers,
  type HomePayment,
  type TurnBookingRow,
} from '@/lib/domain/club-home'
import { at, COURTS, occupancy } from '../../fixtures/grid'

function row(overrides: Partial<TurnBookingRow> = {}): TurnBookingRow {
  return {
    id: 'b1',
    price: 1202,
    player_id: 'ana',
    guest_name: null,
    match_id: null,
    player: { display_name: 'Ana' },
    match: null,
    players: [],
    payments: [],
    ...overrides,
  }
}

function paid(amount: number, more: Partial<HomePayment> = {}): HomePayment {
  return { status: 'confirmed', amount, payer_id: null, payer_position: null, ...more }
}

describe('turnPlayers, a booking', () => {
  it('splits the price in four, the remainder on player 1, and names whoever booked', () => {
    const turn = turnPlayers(row())
    expect(turn.players.map((player) => [player.position, player.name, player.share, player.due, player.state])).toEqual([
      [1, 'Ana', 302, 302, 'due'],
      [2, null, 300, 300, 'due'],
      [3, null, 300, 300, 'due'],
      [4, null, 300, 300, 'due'],
    ])
    expect(turn).toMatchObject({ isMatch: false, restDue: 1202, missingNames: true })
    expect(playerLabel(turn.players[2])).toBe('Jugador 3')
  })

  it('names players 2 to 4 by member or by name', () => {
    const turn = turnPlayers(
      row({
        players: [
          { position: 2, player_id: 'bruno', name: null, player: { display_name: 'Bruno' } },
          { position: 3, player_id: null, name: 'Pepe', player: null },
          { position: 4, player_id: null, name: 'Lucho', player: null },
        ],
      }),
    )
    expect(turn.players.map((player) => [player.name, player.playerId])).toEqual([
      ['Ana', 'ana'],
      ['Bruno', 'bruno'],
      ['Pepe', null],
      ['Lucho', null],
    ])
    expect(turn.missingNames).toBe(false)
  })

  it('counts each player\'s own payments first', () => {
    const turn = turnPlayers(row({ payments: [paid(300, { payer_position: 2 })] }))
    expect(turn.players.map((player) => player.state)).toEqual(['due', 'paid', 'due', 'due'])
    expect(turn.players[1]).toMatchObject({ due: 0, locked: true })
    expect(turn.players[2].locked).toBe(false)
    expect(turn.restDue).toBe(902)
  })

  it('a payment without position covers players only up to what the booking still owes', () => {
    const partly = turnPlayers(row({ payments: [paid(1000)] }))
    expect(partly.restDue).toBe(202)
    expect(partly.players.map((player) => player.due)).toEqual([202, 202, 202, 202])

    const whole = turnPlayers(row({ payments: [paid(1000), paid(202)] }))
    expect(whole.players.map((player) => player.state)).toEqual(['paid', 'paid', 'paid', 'paid'])
    expect(whole.restDue).toBe(0)
  })

  it('a transfer reported from the app covers the booking while the club checks it', () => {
    const turn = turnPlayers(row({ payments: [paid(1202, { status: 'reported' })] }))
    expect(turn.players.map((player) => [player.state, player.due])).toEqual([
      ['reported', 0],
      ['reported', 0],
      ['reported', 0],
      ['reported', 0],
    ])
    expect(turn.restDue).toBe(0)
  })

  it('ignores rejected and refunded payments', () => {
    const turn = turnPlayers(
      row({ payments: [paid(1202, { status: 'rejected' }), paid(300, { status: 'refunded', payer_position: 2 })] }),
    )
    expect(turn.restDue).toBe(1202)
    expect(turn.players[1]).toMatchObject({ state: 'due', locked: false })
  })
})

describe('turnPlayers, an open match', () => {
  const slot = (position: number, id: string | null, name: string) => ({
    position,
    player_id: id,
    player: id ? { display_name: name } : null,
  })

  it('takes its players from the spots, each with his own share', () => {
    const turn = turnPlayers(
      row({
        price: 1602,
        player_id: null,
        player: null,
        match_id: 'm1',
        match: { slots: [slot(2, 'bruno', 'Bruno'), slot(1, 'ana', 'Ana'), slot(3, 'hugo', 'Hugo'), slot(4, null, '')] },
        payments: [paid(402, { payer_id: 'ana' }), paid(400, { payer_id: 'bruno', status: 'reported' })],
      }),
    )
    expect(turn.players.map((player) => [player.position, player.name, player.due, player.state])).toEqual([
      [1, 'Ana', 0, 'paid'],
      [2, 'Bruno', 0, 'reported'],
      [3, 'Hugo', 400, 'due'],
    ])
    expect(turn).toMatchObject({ isMatch: true, restDue: 400, missingNames: false })
  })
})

describe('courtItems and homeSections', () => {
  // Court 1: a booking ended at 09:30 without paying, another 11:00-12:30, the Copa de la Casa 12:30-14:00, a
  // hold at 15:30. Court 2: a booking ended at 11:00 without paying, a paid one before it, the class 11:00-14:00.
  const occupancies = [
    occupancy('o-early', 'court-1', '08:00', '09:30'),
    occupancy('o-paid', 'court-2', '08:00', '09:30'),
    occupancy('o-ended', 'court-2', '09:30', '11:00'),
    occupancy('o-now', 'court-1', '11:00', '12:30'),
    occupancy('o-class', 'court-2', '11:00', '14:00', 'block', 'Clase de menores'),
    { ...occupancy('o-cup', 'court-1', '12:30', '14:00', 'tournament', 'Copa de la Casa'), tournamentId: 't1' },
    occupancy('o-hold', 'court-1', '15:30', '17:00', 'hold', 'Ana'),
  ]
  const booking = (id: string, occupancyId: string, payments: HomePayment[] = []) => ({
    ...row({ id, price: 1200, payments }),
    occupancy_id: occupancyId,
  })
  const items = courtItems({
    courts: COURTS,
    occupancies,
    bookings: [
      booking('b-early', 'o-early'),
      booking('b-paid', 'o-paid', [paid(1200)]),
      booking('b-ended', 'o-ended'),
      booking('b-now', 'o-now'),
    ],
  })
  const ids = (list: { id: string }[]) => list.map((item) => item.id)

  it('makes a card per booking and a line per block or tournament, without holds, in time and court order', () => {
    expect(ids(items)).toEqual(['o-early', 'o-paid', 'o-ended', 'o-now', 'o-class', 'o-cup'])
    expect(items.find((item) => item.id === 'o-class')).toMatchObject({
      kind: 'event',
      courtName: 'Cancha 2',
      label: 'Clase de menores',
      href: null,
    })
    expect(items.find((item) => item.id === 'o-cup')).toMatchObject({ label: 'Copa de la Casa', href: '/club/torneos/t1' })
    expect(items.find((item) => item.id === 'o-now')).toMatchObject({ kind: 'turn', bookingId: 'b-now', restDue: 1200 })
  })

  it('a booking is in play from the minute it starts, and pending from the minute it ends', () => {
    const sections = homeSections(items, at('11:00'))
    expect(ids(sections.playing)).toEqual(['o-now', 'o-class'])
    expect(ids(sections.pending)).toEqual(['o-early', 'o-ended'])
  })

  it('Próximos: what starts within the next 90 minutes, the 90th included', () => {
    expect(ids(homeSections(items, at('11:00')).upcoming)).toEqual(['o-cup'])
    expect(ids(homeSections(items, at('10:59')).upcoming)).toEqual(['o-now', 'o-class'])
  })

  it('with nothing in play, the next item', () => {
    const sections = homeSections(items, at('07:00'))
    expect(sections.playing).toEqual([])
    expect(sections.next?.id).toBe('o-early')
    expect(homeSections(items, at('14:00')).next).toBeNull()
  })
})

describe('timeLeft', () => {
  const slot = { startsAt: at('11:00'), endsAt: at('12:30') }

  it('says how much of the slot went by and what is left', () => {
    expect(timeLeft(slot, at('11:30'))).toEqual({ percentDone: 33, text: 'Faltan 60 min' })
    expect(timeLeft(slot, at('12:29'))).toEqual({ percentDone: 99, text: 'Falta 1 min' })
    expect(timeLeft(slot, at('11:00'))).toEqual({ percentDone: 0, text: 'Faltan 90 min' })
  })
})

describe('Lo que pasa hoy', () => {
  it('lists the tournaments and championships of the day once each', () => {
    expect(
      competitionsToday([
        { ...occupancy('a', 'court-1', '12:30', '14:00', 'tournament', 'Copa de la Casa'), tournamentId: 't1' },
        { ...occupancy('b', 'court-2', '12:30', '14:00', 'tournament', 'Copa de la Casa'), tournamentId: 't1' },
        { ...occupancy('c', 'court-1', '18:30', '20:00', 'championship', 'Apertura'), championshipId: 'c1' },
        occupancy('d', 'court-2', '18:30', '20:00'),
      ]),
    ).toEqual([
      { kind: 'tournament', id: 't1', name: 'Copa de la Casa' },
      { kind: 'championship', id: 'c1', name: 'Apertura' },
    ])
  })

  it('writes a short line with a link for each thing that happens', () => {
    expect(
      todayLines({
        forming: 2,
        competitions: [
          { kind: 'tournament', id: 't1', name: 'Copa de la Casa' },
          { kind: 'championship', id: 'c1', name: 'Apertura' },
        ],
        inside: 8,
        waiting: 3,
      }),
    ).toEqual([
      { text: '2 partidos armándose', href: '/club/grilla' },
      { text: 'Torneo Copa de la Casa', href: '/club/torneos/t1' },
      { text: 'Campeonato Apertura', href: '/club/torneos/campeonatos/c1' },
      { text: '8 en el club hoy', href: '/club/day-use' },
      { text: '3 esperando turno hoy', href: '/club/grilla' },
    ])
  })

  it('says one match in singular and leaves out what does not happen', () => {
    expect(todayLines({ forming: 1, competitions: [], inside: 0, waiting: 0 })).toEqual([
      { text: '1 partido armándose', href: '/club/grilla' },
    ])
    expect(todayLines({ forming: 0, competitions: [], inside: 0, waiting: 0 })).toEqual([])
  })
})

describe('transfersLine', () => {
  it('counts the transfers to confirm and their money', () => {
    expect(transfersLine({ count: 3, total: 4800 })).toBe('3 transferencias por confirmar · $4.800')
    expect(transfersLine({ count: 1, total: 1200 })).toBe('1 transferencia por confirmar · $1.200')
    expect(transfersLine({ count: 0, total: 0 })).toBeNull()
  })
})
