// Restores a production backup (the decrypted artifact of backup.yml) into the LOCAL Supabase, to check it or to look
// at the data. Usage: npm run db:restore -- <folder with data.sql>
//
// The schema comes from the migrations (`supabase db reset --no-seed`), the same ones production runs; then data.sql is
// loaded inside the local database container with psql, in one transaction. Never touches a remote database: it only
// talks to the local stack's container, and localSupabase() refuses a non-local Supabase.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { localSupabase } from './local-supabase.mjs'
import { restoreScript } from './restore-sql.mjs'

const folder = process.argv[2]
if (!folder || !existsSync(join(folder, 'data.sql'))) {
  console.error('Uso: npm run db:restore -- <carpeta con data.sql>')
  process.exit(1)
}

localSupabase()
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync('supabase/config.toml', 'utf8'))?.[1]
if (!projectId) throw new Error('No encontré project_id en supabase/config.toml')
const container = `supabase_db_${projectId}`

const psql = (args, options = {}) =>
  execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', ...args], options)

console.log('1/3 Recreando la base local con las migraciones, sin seed…')
execFileSync('npx', ['supabase', 'db', 'reset', '--local', '--no-seed'], { stdio: 'inherit', shell: process.platform === 'win32' })

console.log('2/3 Cargando data.sql…')
// Every local table with its columns: what the dump can load here.
const local = new Map()
const columns = psql(
  ['-At', '-F', '\t', '-c', `select '"' || table_schema || '"."' || table_name || '"', column_name from information_schema.columns`],
  { encoding: 'utf8' },
)
for (const line of columns.split(/\r?\n/).filter(Boolean)) {
  const [table, column] = line.split('\t')
  local.set(table, (local.get(table) ?? new Set()).add(column))
}
const { sql, skipped } = restoreScript(readFileSync(join(folder, 'data.sql'), 'utf8'), local)
if (skipped.length > 0) console.log(`   Salteado (no existe en el Supabase local): ${skipped.join(', ')}`)
psql(['-v', 'ON_ERROR_STOP=1', '--single-transaction', '-q'], { input: sql, stdio: ['pipe', 'inherit', 'inherit'] })

console.log('3/3 Lo que quedó:')
const counts = psql(
  ['-At', '-F', ' ', '-c',
    "select 'clubes', count(*) from public.clubs union all select 'jugadores', count(*) from public.profiles " +
      "union all select 'reservas', count(*) from public.bookings union all select 'pagos', count(*) from public.payments"],
  { encoding: 'utf8' },
)
console.log(counts.trim())
console.log('Listo. Los archivos subidos (logos, comprobantes, afiches) no están en el backup: solo sus registros.')
