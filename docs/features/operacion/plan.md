---
feature: operacion
type: plan
status: done
date: 2026-11-23
branch: feat/operacion
references: ./design.md
---

# operacion — implementation plan

## Build sequence

| # | step | output | testable how |
|---|---|---|---|
| 0 | Next 16.3.6 → 16.4.6 (found by `npm audit` while adding Sentry) | `fix/next-seguridad`, own PR | lint, typecheck, Vitest, build, e2e |
| 1 | Sentry: `@sentry/nextjs` pinned, `instrumentation.ts`, `instrumentation-client.ts`, `withSentryConfig` | off without DSN | unit of `sentryOptions`, build |
| 2 | `npm run db:restore` | script + pure helpers | unit of `restore-sql.mjs`; manual end-to-end with a demo dump |
| 3 | `/terminos`, `/privacidad`, links | draft text with visible gaps | unit (gaps, banner, links), e2e `legal.spec.ts` |
| 4 | README and `.env.example` | SMTP, Sentry, backups, legal | review |

## Acceptance criteria

- [x] Without `NEXT_PUBLIC_SENTRY_DSN` nothing is initialized; build and tests unchanged.
- [x] A backup restores into the local Supabase and the app opens on it.
- [x] Legal pages public, linked from sign-in, welcome and the player area, draft banner while gaps remain.
- [x] README covers SMTP, Sentry, backup restore and the legal drafts.

## Plan revisions

- **v1 (2026-11-23)**: initial plan. Step 0 added on the way: Next security upgrade, merged on its own first.
