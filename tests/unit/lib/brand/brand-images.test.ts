// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { championshipShareImage, IMAGE_CACHE_CONTROL, iconImage, previewImage } from '@/lib/brand/brand-images'
import { clubTheme } from '@/lib/domain/club-theme'
import { clubPreview } from '@/lib/domain/share-preview'

const BRAND = { name: 'Rustic Pádel', colors: clubTheme({ primary: '#FCB021', background: '#021716' }).dark, logo: null }

describe('brand images', () => {
  it('lets the CDN keep the icon and the previews, so a crawler does not reach the database and Storage', () => {
    expect(IMAGE_CACHE_CONTROL).toBe('public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
    expect(iconImage(BRAND, 64).headers.get('cache-control')).toBe(IMAGE_CACHE_CONTROL)
    expect(previewImage(BRAND, clubPreview(BRAND.name)).headers.get('cache-control')).toBe(IMAGE_CACHE_CONTROL)
  })
})

describe('championship share image', () => {
  const poster = new Uint8Array([1, 2, 3])

  it('is the championship poster as it was uploaded, kept by the CDN', async () => {
    const fetcher = vi.fn(async () => new Response(poster, { headers: { 'content-type': 'image/webp' } }))
    const image = await championshipShareImage(BRAND, { name: 'Copa de Verano', posterUrl: 'https://x/poster.webp' }, fetcher)
    expect(fetcher).toHaveBeenCalledWith('https://x/poster.webp')
    expect(image.headers.get('content-type')).toBe('image/webp')
    expect(image.headers.get('cache-control')).toBe(IMAGE_CACHE_CONTROL)
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(poster)
  })

  it('is just the title without a poster', async () => {
    const fetcher = vi.fn()
    const image = await championshipShareImage(BRAND, { name: 'Copa de Verano', posterUrl: null }, fetcher)
    expect(fetcher).not.toHaveBeenCalled()
    expect(image.headers.get('content-type')).toBe('image/png')
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('falls back to the title when the poster cannot be read', async () => {
    const missing = vi.fn(async () => new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } }))
    expect((await championshipShareImage(BRAND, { name: 'Copa', posterUrl: 'https://x/gone.png' }, missing)).headers.get('content-type')).toBe('image/png')
    const offline = vi.fn(async () => {
      throw new Error('offline')
    })
    expect((await championshipShareImage(BRAND, { name: 'Copa', posterUrl: 'https://x/p.png' }, offline)).headers.get('content-type')).toBe('image/png')
  })
})
