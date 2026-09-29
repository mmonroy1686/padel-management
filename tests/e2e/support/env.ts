import { execSync } from 'node:child_process'

export type LocalSupabase = { apiUrl: string; publishableKey: string; serviceRoleKey: string; mailpitUrl: string }

let cached: LocalSupabase | undefined

// E2E always runs against the local Supabase stack, never production. CI exports these
// variables itself (.github/workflows/ci.yml); locally they come from `supabase status`.
export function localSupabase(): LocalSupabase {
  if (cached) return cached
  if (process.env.CI) {
    cached = {
      apiUrl: required('NEXT_PUBLIC_SUPABASE_URL'),
      publishableKey: required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
      serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
      mailpitUrl: required('MAILPIT_URL'),
    }
    return cached
  }
  const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }))
  cached = {
    apiUrl: status.API_URL,
    publishableKey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
    mailpitUrl: status.MAILPIT_URL ?? status.INBUCKET_URL,
  }
  return cached
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Falta ${name} para los tests e2e`)
  return value
}
