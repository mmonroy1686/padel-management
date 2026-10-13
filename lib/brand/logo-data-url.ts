// The club's logo as a data: URL for ImageResponse, which draws PNG, JPEG and SVG but not WebP. null when there is
// no logo, it is WebP, too big, or Storage does not answer: the image falls back to the initials.
const DRAWABLE = ['image/png', 'image/jpeg', 'image/svg+xml']
const MAX_BYTES = 2 * 1024 * 1024

export async function logoDataUrl(url: string | null, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (!url) return null
  try {
    const response = await fetcher(url)
    const type = response.headers.get('content-type')?.split(';')[0].trim() ?? ''
    if (!response.ok || !DRAWABLE.includes(type)) return null
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > MAX_BYTES) return null
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return null
  }
}
