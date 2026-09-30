import { describe, expect, it } from 'vitest'
import { at } from '../../fixtures/grid'
import { BRUNO, CONTEXT, makeMatch, withPlayers } from '../../fixtures/matches'
import { canJoin, joinStatus } from '@/lib/domain/match-join'

describe('canJoin', () => {
  it('lets a player take a free spot of his side', () => {
    expect(canJoin(makeMatch(), 2, BRUNO, CONTEXT)).toEqual({ ok: true })
  })

  it('checks the same things as join_match, in the same order', () => {
    expect(canJoin(makeMatch({ status: 'confirmed' }), 2, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'El partido ya no está abierto.' })
    expect(canJoin(makeMatch(), 2, BRUNO, { ...CONTEXT, now: at('17:00') })).toEqual({ ok: false, reason: 'El partido ya no está abierto.' })
    expect(canJoin(withPlayers(makeMatch(), ['bruno', null, null, null]), 2, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'Ya estás en este partido.' })
    expect(canJoin(withPlayers(makeMatch(), ['ana', 'x', null, null]), 2, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'Ese lugar ya está ocupado.' })
    expect(canJoin(makeMatch({ categoryMin: 6, categoryMax: 7 }), 2, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'Es para 6ª a 7ª y vos sos 5ª.' })
    expect(canJoin(makeMatch(), 2, { ...BRUNO, category: null }, CONTEXT)).toEqual({ ok: false, reason: 'Es para 4ª a 6ª y todavía no tenés categoría.' })
    expect(canJoin(makeMatch({ type: 'female' }), 2, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'Es un partido femenino.' })
    expect(canJoin(makeMatch(), 3, BRUNO, CONTEXT)).toEqual({ ok: false, reason: 'Este lugar es de drive.' })
    expect(canJoin(makeMatch(), 2, BRUNO, { ...CONTEXT, busy: [{ startsAt: at('21:00'), endsAt: at('22:30') }] })).toEqual({
      ok: false,
      reason: 'Ya tenés una reserva o un partido a esa hora.',
    })
  })

  it('lets someone who plays both sides take any spot', () => {
    expect(canJoin(makeMatch(), 3, { ...BRUNO, side: 'both' }, CONTEXT)).toEqual({ ok: true })
  })
})

describe('joinStatus', () => {
  it('points at the first spot the player can take', () => {
    expect(joinStatus(makeMatch(), BRUNO, CONTEXT)).toEqual({ ok: true, position: 2, text: 'Podés sumarte de revés.' })
  })

  it('says why not otherwise', () => {
    expect(joinStatus(makeMatch(), { ...BRUNO, id: 'ana' }, CONTEXT)).toEqual({ ok: false, text: 'Ya estás anotado.' })
    expect(joinStatus(makeMatch({ type: 'female' }), BRUNO, CONTEXT)).toEqual({ ok: false, text: 'Es un partido femenino.' })
    expect(joinStatus(withPlayers(makeMatch({ status: 'confirmed' }), ['a', 'b', 'c', 'd']), BRUNO, CONTEXT)).toEqual({
      ok: false,
      text: 'El partido ya no está abierto.',
    })
  })
})
