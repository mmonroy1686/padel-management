import { timingSafeEqual } from 'node:crypto'
import { flushOutbox } from '@/lib/notify/outbox'

function hasSecret(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header ?? '')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// An external cron (cron-job.org; the system cron on a VPS) calls this every minute with
// "Authorization: Bearer <NOTIFY_SECRET>", for the avisos of what pg_cron frees. Writes from the app mail
// their own avisos with after() (lib/actions/revalidate.ts). Without NOTIFY_SECRET nobody gets in.
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.NOTIFY_SECRET?.trim()
  if (!secret || !hasSecret(request.headers.get('authorization'), secret)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }
  return Response.json(await flushOutbox())
}
