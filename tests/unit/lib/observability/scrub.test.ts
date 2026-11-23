import { describe, expect, it } from 'vitest'
import { scrub, scrubText } from '@/lib/observability/scrub'

describe('scrubText', () => {
  it('takes out emails and phones', () => {
    expect(scrubText('duplicate key for ana.perez+club@gmail.com')).toBe('duplicate key for [email]')
    expect(scrubText('tel 099 123 456, 098123456 or +598 91 234 567')).toBe('tel [teléfono], [teléfono] or [teléfono]')
  })

  it('leaves dates, times, ids and amounts alone', () => {
    const text = 'booking 425b0064-e055-45a0-8624-4f18dcd6dc69 at 2026-11-23 20:30 for $1600, code 23505'
    expect(scrubText(text)).toBe(text)
  })
})

describe('scrub', () => {
  it('rewrites every string of an event and keeps its shape', () => {
    const event = {
      message: 'failed for ana@x.uy',
      exception: { values: [{ type: 'Error', value: 'phone 099123456 taken' }] },
      breadcrumbs: [{ category: 'fetch', data: { url: '/api?email=bo@x.uy' } }],
      level: 'error',
      count: 3,
    }
    expect(scrub(event)).toEqual({
      message: 'failed for [email]',
      exception: { values: [{ type: 'Error', value: 'phone [teléfono] taken' }] },
      breadcrumbs: [{ category: 'fetch', data: { url: '/api?email=[email]' } }],
      level: 'error',
      count: 3,
    })
  })
})
