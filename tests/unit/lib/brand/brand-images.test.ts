// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { IMAGE_CACHE_CONTROL, iconImage, previewImage } from '@/lib/brand/brand-images'
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
