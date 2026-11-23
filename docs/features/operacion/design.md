---
feature: operacion
type: design
status: approved
date: 2026-11-23
branch: feat/operacion
references: ../../handoff/2026-11-23-validacion-y-multi-club.md
---

# operacion — design (corte 0.2 del handoff)

## Purpose

Before a club of the city tries the app, we need to know when something breaks, to be able to get the data back, emails
that reach every player, and the legal pages any sign-up asks for. None of it changes what the app does.

## 1. Error monitoring (Sentry)

- **`@sentry/nextjs`**, the official SDK: it catches server errors (Server Components, Server Actions, Route Handlers
  and `proxy.ts`, through Next's `instrumentation.ts` `onRequestError`) and browser errors (`instrumentation-client.ts`),
  with the release and the route.
- **Off without the variable:** `NEXT_PUBLIC_SENTRY_DSN` empty → `Sentry.init` is not called; nothing is sent, nothing
  changes. CI, local and the e2e run without it.
- **Privacy:** `sendDefaultPii: false`; no session replay, no tracing at first (`tracesSampleRate: 0`), so no
  performance cost and no personal data. Emails, phones and names are not sent; Supabase error codes and the route are.
- **Source maps** (readable stacks) only when `SENTRY_AUTH_TOKEN` is set at build time on Vercel; without it the build
  works the same.
- Environment: `production` / `preview` from `VERCEL_ENV`, so preview deploys don't mix with production.

Alternative considered: our own handler posting to Sentry's API from `onRequestError` and `window.onerror`, without the
SDK. Less weight, but we would rebuild grouping, release tagging and source maps. Not worth it for a pilot.

**Miguel, outside the repo:** create the Sentry project (Next.js), set `NEXT_PUBLIC_SENTRY_DSN` and (optional)
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in Vercel.

## 2. Backups

- `backup.yml` stays as it is (weekly, encrypted with GPG, kept 90 days as an artifact). It already refuses to upload
  without the passphrase.
- **README: "Restaurar un backup"**, step by step: download the artifact, `gpg --decrypt … | tar xz`, start a clean
  local Supabase, load `roles.sql`, `schema.sql` and `data.sql` with `psql` in that order, and check it with the app.
- **Tested once end to end** with a dump of the demo (not production): dump → encrypt → decrypt → restore into the local
  Supabase → the app shows the demo's club. What happened goes to `notes.md`.
- A script `npm run db:restore -- <folder>` that does the local part (refuses any non-local database), so the README is
  three lines and nobody types the psql commands by hand.

## 3. Email (SMTP)

README: the exact steps in Supabase (Authentication → Emails → SMTP Settings) for Resend: host `smtp.resend.com`, port
`465`, user `resend`, the API key as password, sender on the verified domain. Plus raising the auth emails rate limit.
Miguel does it in the panel; no code.

## 4. Terms and privacy

- Pages `/terminos` and `/privacidad`, public, plain text in the app's style, with a draft in Rioplatense Spanish
  written for Uruguay (Ley 18.331 de protección de datos personales): what data we keep (name, email, phone, category,
  bookings and payments), what for, who sees it (the club's staff), how long, how to ask for it to be deleted.
- **Gaps marked visibly** (`[COMPLETAR: razón social]`, contact email, RUT, address), so it can't go out unfinished by
  mistake. The page says at the top that it is a draft while any gap remains. Not legal advice.
- Product name and domain come from environment variables (still undecided).
- Linked from the sign-in screen and the welcome form ("Al continuar aceptás los términos y la política de privacidad"),
  and from the footer of the player area.

## Out of scope

Uptime monitoring, alert rules in Sentry (Miguel sets them in its panel), automatic restore tests in CI.

## Testing

- Sentry: unit test that `init` is not called without the DSN and is called with the right options with it; the app
  builds and the e2e pass without the variable.
- Restore script: refuses a non-local database (unit); the end-to-end test is the manual run in `notes.md`.
- Legal pages: render, show the draft banner while there are gaps, links present on sign-in and welcome (unit + one e2e
  step).
