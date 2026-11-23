---
feature: multi-club
type: design
status: design
date: 2026-11-23
branch: feat/multi-club
references: ../../handoff/2026-11-23-validacion-y-multi-club.md
---

# multi-club — design (corte 1 del handoff)

## Purpose

The app serves one club: `lib/club/config.ts` fixes `CLUB_SLUG = 'rustic'`. To let a club of the city try it and to sell
it after, each club lives on its own subdomain (`rustic.<dominio>`, `otro.<dominio>`) and adding one needs no code. The
database is already per club (every table has `club_id`, RLS and functions work per club); the work is in the app.

## Decisions

- **One club per subdomain**, resolved in `proxy.ts`.
- **One session per club** (Miguel, 2026-11-23): Supabase's cookies stay host-only, as today. Entering another club means
  signing in again there, with the same account. Simpler and safer: a club never reads another's session, and each
  club's PWA is isolated.
- **One account and one profile** (`profiles`); membership and category per club (`club_members`), as today. A signed-in
  player entering a new club sees that club's welcome.
- Product name and domain still undecided: everything goes through `NEXT_PUBLIC_ROOT_DOMAIN`.

## 1. Resolving the club

- `proxy.ts` reads the host: `<slug>.<NEXT_PUBLIC_ROOT_DOMAIN>` → `slug`; `<slug>.localhost` → `slug` (local
  development); anything else (`localhost`, `*.vercel.app`, previews, the bare root domain) → `DEFAULT_CLUB_SLUG`.
- The slug goes to the request as `x-club-slug`. **The proxy always deletes any incoming `x-club-slug` first**: it is
  set only by us, never trusted from the browser.
- `getClub()` reads it with `headers()`. `CLUB_SLUG` and `lib/club/config.ts` go away.
- Pure function `clubSlugFromHost(host, env)` in `lib/club/host.ts`, unit tested (ports, case, `www`, nested
  subdomains, previews).

## 2. Club not found

A subdomain with no club → a "Club no encontrado" page with status 404, never a 500. `getClub()` calls `notFound()`;
since the root layout itself needs the club, the page is Next's `global-not-found` (read its guide in
`node_modules/next/dist/docs` before writing it; if this version doesn't support it, the proxy checks the slug against
a short-lived cache of club slugs and rewrites to a static 404 page).

## 3. Brand per club

Layout, metadata, viewport, `manifest.ts`, icons and OG images already read `getClub()`: they follow the host. Each
subdomain installs as its own PWA (its own `start_url` scope by origin). The icon and preview responses keep their CDN
cache: Vercel's cache key includes the host.

## 4. Links: the club's URL

- `clubUrl(slug)` → `https://<slug>.<NEXT_PUBLIC_ROOT_DOMAIN>`; without a root domain (local, previews), the current
  `getSiteUrl()`. In local development with subdomains, `http://<slug>.localhost:3000`.
- During a request, links use the club of the host. Replaces `getSiteUrl()` in share links, QR of day use passes, the
  assistant's flyer, `metadataBase`.
- **Emails** are sent by one central job (`/api/avisos/enviar`, after writes): `claim_notification_emails` returns the
  club's slug too (new migration, function recreated with one more column) and each email links to its club's URL.
- Auth: `originFromHeaders` already sends magic links and Google back to the host the person is on. Supabase must allow
  `https://*.<dominio>/**` (Miguel).

## 5. Championship public pages (`/c/[code]`)

`public_championship` returns the owner club's slug too (same jsonb, one more key). If it is not the host's club, the
page redirects to the owner's URL. The brand on the page is the owner's.

## 6. A player in two clubs: nothing mixes

With memberships in two clubs, RLS lets a player read their own rows in both. Every query that filters only by player
must also filter by the host's club:

| Where | Today | Change |
|---|---|---|
| `lib/data/my-bookings.ts` (Mis reservas) | bookings and match slots by player | `club_id` = host's club |
| `lib/data/matches.ts` (busy times, history) | bookings, match slots, tournament entries by player | `club_id` = host's club |
| `lib/data/waitlist.ts` (bell count and list) | notifications by user | `club_id` = host's club |
| `mark_notifications_read()` | marks every club's avisos | new overload `mark_notifications_read(p_club_id)`; the app uses it; the old one stays for the deploy window |

`player_availability` stays per person (when you can play does not depend on the club); preferred courts are courts,
so already per club. Every other function takes the id of something that belongs to a club and works there.

pgTAP: extend the isolation tests with the new and changed functions (a member of club A cannot read or mark club B's
avisos; `claim_notification_emails` slug per row). e2e: a player books in club A, enters club B, completes B's welcome
and books there; Mis reservas and the bell in each club show only that club's.

## 7. Local development and seed

- `rustic.localhost:3000` and `<otro>.localhost:3000` work (browsers resolve `*.localhost` to the machine). Next's
  `allowedDevOrigins` gets `*.localhost`. Supabase local's `additional_redirect_urls` adds `http://*.localhost:3000/**`.
- `seed.sql` adds a second club (`norte`, with courts and prices) and `scripts/demo-*.mjs` take `--club=<slug>`.
- `DEFAULT_CLUB_SLUG=rustic` keeps `localhost:3000`, CI and every current e2e as today.

## Miguel, outside the repo

1. Buy/pick the domain; in Vercel → Domains add `<dominio>` and `*.<dominio>` (wildcard needs Vercel's nameservers).
2. Vercel env: `NEXT_PUBLIC_ROOT_DOMAIN=<dominio>`, `DEFAULT_CLUB_SLUG=rustic`. Redeploy.
3. Supabase → Authentication → URL Configuration: Site URL `https://rustic.<dominio>`; Redirect URLs add
   `https://*.<dominio>/**` (keep the current ones until the move is done).
4. Google OAuth (if used): authorized origins/redirects per Supabase's callback (unchanged: Supabase hosts it).

## Out of scope

Creating clubs from a panel (corte 3), staff invitations (corte 2), shared session between subdomains, custom domains
per club (`reservas.miclub.uy`).

## Acceptance (from the handoff)

- Two clubs locally: `rustic.localhost:3000` and `norte.localhost:3000` show each its brand, courts, grid and players;
  neither sees the other's data.
- pgTAP isolation for every new or changed function.
- e2e: booking in A, welcome and booking in B, each club's Mis reservas only its own.
- Without a subdomain and with `DEFAULT_CLUB_SLUG=rustic`, every current e2e passes unchanged.
- Unknown subdomain → 404 "Club no encontrado".
- No fixed club left: `grep -rnw CLUB_SLUG` returns nothing (the e2e support constant is renamed too). The handoff's own
  `DEFAULT_CLUB_SLUG` contains the text, so the check is by whole word.
