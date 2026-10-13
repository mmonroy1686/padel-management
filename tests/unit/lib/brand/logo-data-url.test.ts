// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { logoDataUrl } from '@/lib/brand/logo-data-url'

function answer(body: string, type: string, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(body, { status, headers: { 'content-type': type } }))
}

describe('logoDataUrl', () => {
  it('turns a PNG, JPEG or SVG logo into a data URL', async () => {
    expect(await logoDataUrl('https://db.test/logo.png', answer('png', 'image/png'))).toBe('data:image/png;base64,cG5n')
    expect(await logoDataUrl('https://db.test/logo.svg', answer('<svg/>', 'image/svg+xml; charset=utf-8'))).toBe(
      'data:image/svg+xml;base64,PHN2Zy8+',
    )
  })

  it('gives null without a logo, for WebP, or when Storage fails', async () => {
    const fetcher = answer('png', 'image/png')
    expect(await logoDataUrl(null, fetcher)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
    expect(await logoDataUrl('https://db.test/logo.webp', answer('webp', 'image/webp'))).toBeNull()
    expect(await logoDataUrl('https://db.test/logo.png', answer('', 'text/plain', 404))).toBeNull()
    expect(await logoDataUrl('https://db.test/logo.png', vi.fn<typeof fetch>(async () => Promise.reject(new Error('offline'))))).toBeNull()
  })

  it('keeps the logo in the server cache: a new logo has a new path', async () => {
    const fetcher = answer('png', 'image/png')
    await logoDataUrl('https://db.test/logo-1.png', fetcher)
    expect(fetcher).toHaveBeenCalledWith('https://db.test/logo-1.png', { cache: 'force-cache' })
  })

  it('turns down a logo over 2 MB by its length, without reading it', async () => {
    const response = new Response('png', { headers: { 'content-type': 'image/png', 'content-length': String(3 * 1024 * 1024) } })
    const read = vi.spyOn(response, 'arrayBuffer')
    expect(await logoDataUrl('https://db.test/logo.png', vi.fn<typeof fetch>(async () => response))).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })
})
