import { describe, expect, it } from 'vitest'
import { parseProductForm } from '@/lib/domain/day-use-form'

const C1 = '22222222-2222-2222-2222-222222222201'
const VALID: Record<string, string | string[]> = {
  name: ' Day use completo ',
  price: '450',
  capacity: '30',
  includes: 'Vestuarios, Pileta , , Cancha libre',
  weekdays: ['6', '0'],
  fromTime: '08:00',
  toTime: '12:30',
  courtIds: [C1],
  sortOrder: '1',
}

function productForm(overrides: Record<string, string | string[]> = {}): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item)
  }
  return form
}

const messageOf = (overrides: Record<string, string | string[]>) => {
  const result = parseProductForm(productForm(overrides))
  return result.ok ? null : result.message
}

describe('parseProductForm', () => {
  it('reads a valid pass', () => {
    expect(parseProductForm(productForm())).toEqual({
      ok: true,
      value: {
        name: 'Day use completo',
        price: 450,
        capacity: 30,
        includes: ['Vestuarios', 'Pileta', 'Cancha libre'],
        weekdays: [0, 6],
        fromTime: '08:00',
        toTime: '12:30',
        courtIds: [C1],
        sortOrder: 1,
      },
    })
  })

  it('accepts a pass with no courts, no weekdays (only exceptions) and until midnight', () => {
    expect(parseProductForm(productForm({ courtIds: [], weekdays: [], toTime: '24:00' }))).toMatchObject({
      ok: true,
      value: { courtIds: [], weekdays: [], toTime: '24:00' },
    })
  })

  it('explains each mistake in Spanish', () => {
    expect(messageOf({ name: '' })).toBe('Poné un nombre de hasta 60 letras.')
    expect(messageOf({ price: 'mil' })).toBe('Ingresá el precio en pesos, sin puntos.')
    expect(messageOf({ capacity: '0' })).toBe('El cupo va de 1 a 500 personas.')
    expect(messageOf({ includes: 'a,b,c,d,e,f,g,h,i' })).toBe('Poné hasta 8 cosas que incluye, de hasta 40 letras cada una.')
    expect(messageOf({ includes: 'x'.repeat(41) })).toBe('Poné hasta 8 cosas que incluye, de hasta 40 letras cada una.')
    expect(messageOf({ weekdays: ['7'] })).toBe('Elegí días de la semana válidos.')
    expect(messageOf({ toTime: '08:00' })).toBe('El horario tiene que terminar después de empezar.')
    expect(messageOf({ courtIds: ['cancha-1'] })).toBe('Elegí las canchas.')
  })
})
