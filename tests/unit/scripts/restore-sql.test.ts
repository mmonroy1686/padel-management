import { describe, expect, it } from 'vitest'
import { dumpedTables, restoreScript } from '../../../scripts/restore-sql.mjs'

const DUMP = `SET session_replication_role = replica;
COPY "auth"."users" ("id", "email", "new_column") FROM stdin;
u1	ana@x.uy	extra
u2	bo\\tb@x.uy	extra
\\.
COPY "public"."clubs" ("id", "slug") FROM stdin;
c1	rustic
\\.
COPY "storage"."bucket_lifecycle_states" ("id") FROM stdin;
b1
\\.
`

const LOCAL = new Map([
  ['"auth"."users"', new Set(['id', 'email'])],
  ['"public"."clubs"', new Set(['id', 'slug'])],
])

describe('restore script', () => {
  it('finds every table the dump fills, once', () => {
    expect(dumpedTables(DUMP + DUMP)).toEqual(['"auth"."users"', '"public"."clubs"', '"storage"."bucket_lifecycle_states"'])
  })

  it('empties those tables and loads the dump as is when the local columns are not known', () => {
    const { sql, skipped } = restoreScript(DUMP)
    expect(sql).toBe(`TRUNCATE "auth"."users", "public"."clubs", "storage"."bucket_lifecycle_states" CASCADE;\n${DUMP}`)
    expect(skipped).toEqual([])
  })

  it('leaves out the tables and columns the local database does not have, and says which', () => {
    const { sql, skipped } = restoreScript(DUMP, LOCAL)
    expect(skipped).toEqual(['"auth"."users".new_column', '"storage"."bucket_lifecycle_states"'])
    expect(sql).toBe(`TRUNCATE "auth"."users", "public"."clubs" CASCADE;
SET session_replication_role = replica;
COPY "auth"."users" ("id", "email") FROM stdin;
u1	ana@x.uy
u2	bo\\tb@x.uy
\\.
COPY "public"."clubs" ("id", "slug") FROM stdin;
c1	rustic
\\.
`)
  })

  it('refuses a file without data', () => {
    expect(() => restoreScript('-- schema only\n')).toThrow('no hay ningún COPY')
  })
})
