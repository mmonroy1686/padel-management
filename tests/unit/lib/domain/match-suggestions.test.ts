import { describe, expect, it } from 'vitest'
import { TIMEZONE } from '../../fixtures/grid'
import { makeMatch } from '../../fixtures/matches'
import { inviteText, toSuggestion, type SuggestionRow } from '@/lib/domain/match-suggestions'

const ROW: SuggestionRow = {
  player_id: 'b',
  display_name: 'Bruno Díaz',
  category: 6,
  spot: 2,
  exact_side: true,
  times_played: 3,
  usually_free: true,
  prefers_court: true,
  score: 83,
}

describe('toSuggestion', () => {
  it('turns the flags into reasons, in Spanish', () => {
    expect(toSuggestion(ROW, { match: makeMatch(), timezone: TIMEZONE })).toEqual({
      playerId: 'b',
      name: 'Bruno Díaz',
      score: 83,
      chips: [
        { text: 'Juega de revés', hit: true },
        { text: '6ª categoría', hit: false },
        { text: 'Jugó 3 veces los jueves a las 20:00', hit: true },
        { text: 'Suele estar libre los jueves de noche', hit: true },
        { text: 'Prefiere la Cancha 1', hit: false },
      ],
    })
  })

  it('says when he plays both sides or played once', () => {
    const view = toSuggestion(
      { ...ROW, exact_side: false, times_played: 1, usually_free: false, prefers_court: false },
      { match: makeMatch(), timezone: TIMEZONE },
    )
    expect(view.chips.map((chip) => chip.text)).toEqual([
      'Juega en los dos lados',
      '6ª categoría',
      'Jugó 1 vez los jueves a las 20:00',
    ])
  })
})

describe('inviteText', () => {
  it('greets by first name before the match message', () => {
    expect(inviteText('Bruno Díaz', 'Falta 1')).toBe('Hola Bruno! Te paso este partido, por si te sirve:\n\nFalta 1')
  })
})
