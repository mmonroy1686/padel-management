import { execSync } from 'node:child_process'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

// Keys of the local Supabase stack (`supabase start`). Refuses anything that is not local.
export function localSupabase() {
  const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }))
  const local = {
    apiUrl: status.API_URL,
    publishableKey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
    mailpitUrl: status.MAILPIT_URL ?? status.INBUCKET_URL,
  }
  if (!LOCAL_HOSTS.has(new URL(local.apiUrl).hostname)) {
    throw new Error(`Este script solo corre contra Supabase local, no contra ${local.apiUrl}`)
  }
  return local
}
