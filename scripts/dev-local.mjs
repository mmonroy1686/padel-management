// `next dev` against the LOCAL Supabase stack, whatever .env.local says: variables already set in
// process.env win over .env files.
import { spawn } from 'node:child_process'
import { localSupabase } from './local-supabase.mjs'

const { apiUrl, publishableKey } = localSupabase()
console.log(`Supabase local: ${apiUrl}`)

const child = spawn('npx', ['next', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: apiUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey },
})
child.on('exit', (code) => process.exit(code ?? 0))
