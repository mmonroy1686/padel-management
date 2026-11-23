// An image from Storage as a data: URL for ImageResponse, which draws PNG, JPEG and SVG but not WebP. null when there
// is none, it is WebP, too big, or Storage does not answer: the image goes on without it.
const DRAWABLE = ['image/png', 'image/jpeg', 'image/svg+xml']
const MAX_LOGO_BYTES = 2 * 1024 * 1024

// The club's logo; without it the image shows the initials.
export function logoDataUrl(url: string | null, fetcher: typeof fetch = fetch): Promise<string | null> {
  return drawableDataUrl(url, MAX_LOGO_BYTES, fetcher)
}

// The free-slots flyer's blurred background (a JPG the browser made, well under the bucket's 2 MB).
export function flyerBackgroundDataUrl(url: string | null, fetcher: typeof fetch = fetch): Promise<string | null> {
  return drawableDataUrl(url, MAX_LOGO_BYTES, fetcher)
}

async function drawableDataUrl(url: string | null, maxBytes: number, fetcher: typeof fetch): Promise<string | null> {
  if (!url) return null
  try {
    // The path carries the upload's timestamp, so a cached image is never a stale one.
    const response = await fetcher(url, { cache: 'force-cache' })
    const type = response.headers.get('content-type')?.split(';')[0].trim() ?? ''
    if (!response.ok || !DRAWABLE.includes(type)) return null
    if (Number(response.headers.get('content-length')) > maxBytes) return null
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > maxBytes) return null
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return null
  }
}
