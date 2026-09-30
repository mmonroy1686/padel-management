import { isUuid, readInt, readText, readTime } from './input'
import type { ParseResult } from './settings'
import { parseTime } from './time'

export type ProductInput = {
  name: string
  price: number
  capacity: number
  includes: string[]
  weekdays: number[]
  fromTime: string
  toTime: string
  courtIds: string[]
  sortOrder: number
}

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

// Same limits as save_day_use_product, with a Spanish message for each. "What it includes" comes as
// one text separated by commas.
export function parseProductForm(form: FormData): ParseResult<ProductInput> {
  const name = readText(form, 'name', { maxLength: 60 })
  if (!name) return fail('Poné un nombre de hasta 60 letras.')
  const price = readInt(form, 'price', { min: 0, max: 10_000_000 })
  if (price === null) return fail('Ingresá el precio en pesos, sin puntos.')
  const capacity = readInt(form, 'capacity', { min: 1, max: 500 })
  if (capacity === null) return fail('El cupo va de 1 a 500 personas.')

  const rawIncludes = form.get('includes')
  const includes = (typeof rawIncludes === 'string' ? rawIncludes : '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (includes.length > 8 || includes.some((item) => item.length > 40)) {
    return fail('Poné hasta 8 cosas que incluye, de hasta 40 letras cada una.')
  }

  const weekdays = [...new Set(form.getAll('weekdays').map(Number))].sort((a, b) => a - b)
  if (weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return fail('Elegí días de la semana válidos.')

  const fromTime = readTime(form, 'fromTime')
  const toTime = readTime(form, 'toTime')
  if (!fromTime || !toTime || parseTime(toTime) <= parseTime(fromTime)) {
    return fail('El horario tiene que terminar después de empezar.')
  }

  const rawCourts = form.getAll('courtIds')
  if (!rawCourts.every(isUuid)) return fail('Elegí las canchas.')
  const courtIds = [...new Set(rawCourts.map((id) => id.toLowerCase()))]

  return {
    ok: true,
    value: {
      name,
      price,
      capacity,
      includes,
      weekdays,
      fromTime,
      toTime,
      courtIds,
      sortOrder: readInt(form, 'sortOrder', { min: 0, max: 100 }) ?? 0,
    },
  }
}
