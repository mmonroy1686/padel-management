---
feature: operacion
type: note
date: 2026-11-23
branch: feat/operacion
---

# operacion — notes

## Next 16.3.6 had critical advisories

`npm audit` after adding Sentry showed the critical finding was Next itself, not Sentry: unauthenticated RCE in the
Image Optimization API with SVG (GHSA-2464-fhr4-w9xw) and in `use cache` with typed arrays (GHSA-673q-mjm6-r5xr), among
others. 16.4.6 fixes all. It went in its own branch, `fix/next-seguridad`, to merge first. Nothing in the 16.4 docs
affects us (new features are opt-in; Turbopack's `import.meta.glob` change, which we don't use).

Sentry 11.17.0 was released the same day; pinned 11.14.0 (a week old). Its `@sentry/cloudflare` pulls `vite`, whose
audit findings `npm audit fix` resolves inside the allowed range. In this version `withSentryConfig` is imported from
`@sentry/nextjs/config`, not the package root.

## Backup restore, tested end to end (demo, not production)

1. `supabase db dump --linked` × 3 (roles, schema, data) against the demo — the same commands as `backup.yml`.
2. tar + `gpg --symmetric` as the workflow, then `gpg --decrypt | tar xz`: files identical (`cmp`).
3. `npm run db:restore -- <folder>`: 1 club, 28 players, 348 bookings, 153 payments; `/auth/ingreso` showed the demo's
   club name.

What the first tries hit, now handled by the script:
- Hosted Supabase runs newer Storage and Auth than the CLI 2.118: tables (`storage.bucket_lifecycle_states`,
  `storage.lifecycle_abandoned_artifacts`) and columns (`auth.one_time_tokens.link_token_hash`,
  `auth.saml_providers.dedicated_scope`) the local database lacks. The script loads only what exists locally and lists
  the rest.
- The local `postgres` user does not own Storage's tables: the load runs as `supabase_admin` inside the container.
- No `psql` on the machine: it runs inside `supabase_db_<project_id>`.
- The migrations create the Storage buckets, and the dump has them too: the script truncates every dumped table first.

Uploaded files (logos, receipts, posters) live in Storage, not in the database: the backup has their rows only.

## Legal drafts

Phones are stored only for championship sign-ups (`players.phone`), not in `profiles`: the privacy text says so instead
of listing a phone for every player.

## e2e on this machine

The full suite fails 4–5 specs now and then (dev server cold compiles, "destination stream closed early"); they pass
when re-run alone. CI is the judge.
