import 'server-only'
import { headers } from 'next/headers'
import { getSiteUrl, originFromHeaders } from './redirect'

// The origin the visitor is on (https://<club>.<dominio>, http://<club>.localhost:3000): during a request, the club's
// own URL, for links people share and metadataBase.
export async function requestOrigin(): Promise<string> {
  const incoming = await headers()
  return originFromHeaders((name) => incoming.get(name), getSiteUrl())
}
