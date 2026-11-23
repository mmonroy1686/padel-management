// Pure helpers of scripts/db-restore.mjs, kept apart so they can be tested.

const COPY_TABLE = /^COPY "([a-z_][a-z0-9_]*)"\."([a-z_][a-z0-9_]*)"/gm
// A COPY block: its header line (with the column list), the rows, and the "\." that closes it.
const COPY_BLOCK = /^COPY "([a-z_][a-z0-9_]*)"\."([a-z_][a-z0-9_]*)" \(([^)]*)\) FROM stdin;\n([\s\S]*?)^\\\.\n?/gm

// Every table a data-only dump fills, as "schema"."table", in the order they appear.
export function dumpedTables(dataSql) {
  const tables = []
  for (const [, schema, table] of dataSql.matchAll(COPY_TABLE)) {
    const name = `"${schema}"."${table}"`
    if (!tables.includes(name)) tables.push(name)
  }
  return tables
}

// What goes to psql: empty the tables the dump fills (what the migrations or a seed left in them, like the Storage
// buckets), then the dump. Hosted Supabase runs newer Storage and Auth than the CLI, so `local` (table → its columns in
// the local database) lets us leave out the tables and columns the local one does not have; they are named in
// `skipped`. Without `local`, everything is loaded as is.
/** @param {string} rawSql @param {Map<string, Set<string>> | null} [local] */
export function restoreScript(rawSql, local = null) {
  // A dump that went through Windows may have CRLF line endings; COPY blocks are matched line by line.
  const dataSql = rawSql.replace(/\r\n/g, '\n')
  const tables = dumpedTables(dataSql)
  if (tables.length === 0) throw new Error('El archivo no tiene datos para restaurar (no hay ningún COPY).')
  const skipped = []
  const kept = tables.filter((name) => local === null || local.has(name))
  const data = dataSql.replace(COPY_BLOCK, (block, schema, table, columnList, rows) => {
    if (local === null) return block
    const name = `"${schema}"."${table}"`
    const columns = local.get(name)
    if (!columns) {
      if (!skipped.includes(name)) skipped.push(name)
      return ''
    }
    const dumped = columnList.split(', ').map((column) => column.replaceAll('"', ''))
    const keep = dumped.map((column) => columns.has(column))
    if (keep.every(Boolean)) return block
    for (const [index, column] of dumped.entries()) {
      if (!keep[index] && !skipped.includes(`${name}.${column}`)) skipped.push(`${name}.${column}`)
    }
    // COPY's text format escapes tabs inside values, so a real tab always separates columns.
    const trimmed = rows
      .split('\n')
      .map((row) => (row === '' ? row : row.split('\t').filter((_, index) => keep[index]).join('\t')))
      .join('\n')
    const header = dumped.filter((_, index) => keep[index]).map((column) => `"${column}"`).join(', ')
    return `COPY ${name} (${header}) FROM stdin;\n${trimmed}\\.\n`
  })
  return { sql: `TRUNCATE ${kept.join(', ')} CASCADE;\n${data}`, skipped }
}
