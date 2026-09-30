import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { passQrSvg } = await import('@/lib/qr/pass-qr')
const URL = 'https://app.test/club/day-use/pase/DU-482193'

describe('passQrSvg', () => {
  it('draws the check-in link as an SVG QR code', async () => {
    const svg = await passQrSvg(URL)
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain('viewBox')
  })

  it('draws the same link the same way, and another link differently', async () => {
    expect(await passQrSvg(URL)).toBe(await passQrSvg(URL))
    expect(await passQrSvg('https://app.test/club/day-use/pase/DU-000001')).not.toBe(await passQrSvg(URL))
  })
})
