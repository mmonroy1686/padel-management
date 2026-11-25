import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))

import { shrunkSize, uploadClubPhoto } from '@/lib/storage/club-photo'

describe('shrunkSize', () => {
  it('fits the longest side in 1600 px', () => {
    expect(shrunkSize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(shrunkSize(3000, 4000)).toEqual({ width: 1200, height: 1600 })
  })

  it('never enlarges a small photo', () => {
    expect(shrunkSize(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('uploadClubPhoto', () => {
  it('turns down what is not a photo before reading it', async () => {
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    expect(await uploadClubPhoto('club', file)).toEqual({ error: 'Subí una foto JPG, PNG o WebP.' })
  })
})
