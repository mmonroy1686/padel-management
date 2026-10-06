import { describe, expect, it } from 'vitest'
import {
  parseCategoryForm,
  parseChampionshipForm,
  parsePairForm,
  parseRegisterForm,
  parseUnavailabilityForm,
  parseWindowForm,
} from '@/lib/domain/championship-form'

const TIMEZONE = 'America/Montevideo'
const ID = '55555555-5555-5555-5555-555555555555'
const C1 = '22222222-2222-2222-2222-222222222201'
const C2 = '22222222-2222-2222-2222-222222222202'
const PROFILE = '66666666-6666-6666-6666-666666666666'

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item)
  }
  return data
}

describe('parseChampionshipForm', () => {
  const VALID = { name: 'Primavera', rules: ' Al mejor de 3 sets. ', maxCategories: '2', closesDate: '', closesTime: '' }

  it('reads the data, with the deadline on the club clock or none', () => {
    expect(parseChampionshipForm(form(VALID), TIMEZONE)).toEqual({
      ok: true,
      value: { name: 'Primavera', rules: 'Al mejor de 3 sets.', maxCategories: 2, closesAt: null },
    })
    expect(parseChampionshipForm(form({ ...VALID, closesDate: '2026-10-16', closesTime: '20:00' }), TIMEZONE)).toMatchObject({
      ok: true,
      value: { closesAt: '2026-10-16T23:00:00.000Z' },
    })
  })

  it('explains what is wrong', () => {
    expect(parseChampionshipForm(form({ ...VALID, name: '' }), TIMEZONE)).toEqual({ ok: false, message: 'Poné un nombre de hasta 80 letras.' })
    expect(parseChampionshipForm(form({ ...VALID, maxCategories: '9' }), TIMEZONE)).toEqual({
      ok: false,
      message: 'Cada jugador puede anotarse en 1 a 5 categorías.',
    })
    expect(parseChampionshipForm(form({ ...VALID, closesDate: '2026-10-16' }), TIMEZONE)).toEqual({
      ok: false,
      message: 'Completá el día y la hora del cierre, o dejalos vacíos.',
    })
  })
})

describe('parseWindowForm', () => {
  const VALID = { championshipId: ID, date: '2026-10-17', fromTime: '08:00', toTime: '14:00', courtIds: [C1, C2] }

  it('reads a day of play', () => {
    expect(parseWindowForm(form(VALID))).toEqual({
      ok: true,
      value: { championshipId: ID, date: '2026-10-17', fromTime: '08:00', toTime: '14:00', courtIds: [C1, C2] },
    })
  })

  it('explains what is wrong', () => {
    expect(parseWindowForm(form({ ...VALID, toTime: '08:00' }))).toEqual({ ok: false, message: '"Hasta" tiene que ser después de "Desde".' })
    expect(parseWindowForm(form({ ...VALID, courtIds: [] }))).toEqual({ ok: false, message: 'Elegí las canchas.' })
    expect(parseWindowForm(form({ ...VALID, date: '2026-02-30' }))).toEqual({ ok: false, message: 'Elegí el día y las horas.' })
  })
})

describe('parseCategoryForm', () => {
  const VALID = {
    championshipId: ID, name: '6ta Libre', gender: 'open', levelMin: '', levelMax: '', minPairs: '4', maxPairs: '12',
    price: '2000', format: 'groups_knockout', groupSize: '4', qualifiers: '2', matchMinutes: '90', seeding: 'ranking',
    thirdSet: 'super_tiebreak',
  }

  it('reads a category with its defaults', () => {
    expect(parseCategoryForm(form(VALID))).toEqual({
      ok: true,
      value: {
        championshipId: ID, name: '6ta Libre', gender: 'open', levelMin: null, levelMax: null, minPairs: 4, maxPairs: 12,
        price: 2000, format: 'groups_knockout', groupSize: 4, qualifiers: 2, matchMinutes: 90, seeding: 'ranking',
        thirdSet: 'super_tiebreak', goldenPoint: false, timeLimit: null,
      },
    })
    expect(parseCategoryForm(form({ ...VALID, levelMin: '5', levelMax: '6', goldenPoint: 'on' }))).toMatchObject({
      ok: true,
      value: { levelMin: 5, levelMax: 6, goldenPoint: true },
    })
  })

  it('reads a time limit only when the matches have one', () => {
    expect(parseCategoryForm(form({ ...VALID, timeLimitMode: 'timed', timeLimit: '50' }))).toMatchObject({ ok: true, value: { timeLimit: 50 } })
    expect(parseCategoryForm(form({ ...VALID, timeLimitMode: 'none', timeLimit: '50' }))).toMatchObject({ ok: true, value: { timeLimit: null } })
    expect(parseCategoryForm(form({ ...VALID, timeLimitMode: 'timed', timeLimit: '120' }))).toEqual({
      ok: false,
      message: 'El límite de tiempo va de 20 minutos a los minutos por partido.',
    })
  })

  it('explains what is wrong', () => {
    expect(parseCategoryForm(form({ ...VALID, name: '' }))).toEqual({ ok: false, message: 'Poné un nombre de hasta 40 letras.' })
    expect(parseCategoryForm(form({ ...VALID, minPairs: '13' }))).toEqual({
      ok: false,
      message: 'El mínimo de parejas va de 2 a 64 y no pasa el máximo.',
    })
    expect(parseCategoryForm(form({ ...VALID, levelMin: '5' }))).toEqual({
      ok: false,
      message: 'La categoría "desde" tiene que ser menor o igual que "hasta", o dejá las dos vacías.',
    })
    expect(parseCategoryForm(form({ ...VALID, groupSize: '3', qualifiers: '3' }))).toEqual({
      ok: false,
      message: 'En zonas de 3 clasifican 1 o 2.',
    })
    expect(parseCategoryForm(form({ ...VALID, price: '-1' }))).toEqual({ ok: false, message: 'Ingresá el precio por pareja, sin puntos.' })
  })
})

describe('parseRegisterForm', () => {
  const MEMBER = { categoryId: ID, myLevel: '5', partnerKind: 'member', partnerProfileId: PROFILE, partnerLevel: '6' }
  const GUEST = { categoryId: ID, myLevel: '5', partnerKind: 'guest', partnerName: ' Pedro Pérez ', partnerPhone: '+598 99 123 456', partnerLevel: '6' }

  it('reads a partner who is a member or from outside', () => {
    expect(parseRegisterForm(form(MEMBER))).toEqual({
      ok: true,
      value: { categoryId: ID, myLevel: 5, partner: { kind: 'member', profileId: PROFILE, level: 6 } },
    })
    expect(parseRegisterForm(form(GUEST))).toEqual({
      ok: true,
      value: { categoryId: ID, myLevel: 5, partner: { kind: 'guest', name: 'Pedro Pérez', phone: '099123456', level: 6 } },
    })
  })

  it('explains what is wrong', () => {
    expect(parseRegisterForm(form({ ...MEMBER, partnerProfileId: '' }))).toEqual({ ok: false, message: 'Elegí a tu compañero de la lista de socios.' })
    expect(parseRegisterForm(form({ ...GUEST, partnerPhone: '123' }))).toEqual({
      ok: false,
      message: 'Revisá el teléfono: tiene que tener entre 8 y 15 números.',
    })
    expect(parseRegisterForm(form({ ...GUEST, partnerName: '' }))).toEqual({ ok: false, message: 'Poné el nombre de tu compañero.' })
    expect(parseRegisterForm(form({ ...MEMBER, myLevel: '9' }))).toEqual({ ok: false, message: 'Elegí tu categoría.' })
    expect(parseRegisterForm(form({ ...MEMBER, categoryId: 'k1' }))).toEqual({ ok: false, message: 'Elegí la categoría.' })
  })
})

describe('parsePairForm', () => {
  it('reads two players and a note', () => {
    const value = parsePairForm(
      form({
        categoryId: ID,
        player1Kind: 'member', player1ProfileId: PROFILE, player1Level: '5',
        player2Kind: 'guest', player2Name: 'Lucía', player2Phone: '099 111 002', player2Level: '5',
        note: 'Pagan el sábado',
      }),
    )
    expect(value).toEqual({
      ok: true,
      value: {
        categoryId: ID,
        player1: { kind: 'member', profileId: PROFILE, level: 5 },
        player2: { kind: 'guest', name: 'Lucía', phone: '099111002', level: 5 },
        note: 'Pagan el sábado',
      },
    })
  })

  it('says which player is wrong', () => {
    expect(
      parsePairForm(form({ categoryId: ID, player1Kind: 'member', player1ProfileId: PROFILE, player1Level: '5', player2Level: '5' })),
    ).toEqual({ ok: false, message: 'Elegí si el jugador 2 es socio o de afuera.' })
  })
})

describe('parseUnavailabilityForm', () => {
  it('reads the blocks marked and a note', () => {
    expect(parseUnavailabilityForm(form({ entryId: ID, blocks: ['2026-10-17@08:00', '2026-10-17@08:00', '2026-10-18@14:00'], note: '' }))).toEqual({
      ok: true,
      value: { entryId: ID, blocks: ['2026-10-17@08:00', '2026-10-18@14:00'], note: null },
    })
    expect(parseUnavailabilityForm(form({ entryId: ID }))).toEqual({ ok: true, value: { entryId: ID, blocks: [], note: null } })
  })

  it('refuses anything that is not a block', () => {
    expect(parseUnavailabilityForm(form({ entryId: ID, blocks: ['sábado'] }))).toEqual({ ok: false, message: 'Revisá los horarios marcados.' })
  })
})
