// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FLYER_SIZE, freeSlotsImage, loadFlyerFont } from '@/lib/brand/free-slots-image'
import { clubTheme } from '@/lib/domain/club-theme'
import { flyerLayout } from '@/lib/domain/free-slots-flyer'
import { at, makeGrid, occupancy } from '../../fixtures/grid'

const BRAND = { name: 'Rustic Pádel', colors: clubTheme({ primary: '#FCB021', background: '#021716' }).dark, logo: null }
const TEXT = { day: 'JUEVES 1/10', contact: 'Consultanos: 092 369 558' }

describe('freeSlotsImage', () => {
  it('draws a vertical PNG that no CDN keeps', async () => {
    const layout = flyerLayout(makeGrid({ occupancies: [occupancy('o1', 'court-2', '20:00', '21:30')], now: at('12:00') }))
    const image = freeSlotsImage(BRAND, layout, TEXT)
    expect(FLYER_SIZE).toEqual({ width: 1080, height: 1920 })
    expect(image.headers.get('content-type')).toBe('image/png')
    expect(image.headers.get('cache-control')).toBe('private, no-store')
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('still draws a day with nothing free', async () => {
    const image = freeSlotsImage(BRAND, flyerLayout(makeGrid({ now: at('22:00') })), TEXT)
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it("draws with the panel's display font when it is loaded", async () => {
    const font = await loadFlyerFont()
    const image = freeSlotsImage(BRAND, flyerLayout(makeGrid({ now: at('12:00') })), TEXT, font)
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('draws the club photo behind the times, and the club name when there is no WhatsApp', async () => {
    const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const image = freeSlotsImage(BRAND, flyerLayout(makeGrid({ now: at('12:00') })), { day: 'JUEVES 1/10', contact: null }, undefined, photo)
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('draws the club logo alone, with no background behind it', async () => {
    const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const image = freeSlotsImage({ ...BRAND, logo }, flyerLayout(makeGrid({ now: at('12:00') })), TEXT)
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })
})
