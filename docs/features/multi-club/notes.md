---
feature: multi-club
type: note
date: 2026-11-24
branch: feat/multi-club
---

# multi-club — notes

## Why `findClub` and `getClub`

Next 16's `global-not-found` covers URLs with no route, not a `notFound()` thrown by the root layout. The root layout,
metadata, viewport, manifest and icons use `findClub()` (null-safe, default brand); pages use `getClub()`, which calls
`notFound()` and renders `app/not-found.tsx` inside the layout ("Club no encontrado").

## The club comes from the host, not from a header

A first version passed `x-club-slug` from `proxy.ts`; the review found that on routes the matcher skips (paths ending in
`.png`, …) a header sent by the browser would have been read. `clubSlug()` now reads the host itself. Choosing a host only
shows that club, as visiting its subdomain would; RLS and the functions check membership per club.

## Review fixes

- `loadMyWaitlist` read slot waits and holds by player only: a player of two clubs would have seen the other club's
  waits and hold on Inicio and Reservar, priced and named with this club's rules. Now per club.
- `/c/<code>` of a non-default club redirected to itself while there is no root domain (every host is the default club).
  The redirect is skipped when the owner's URL is the current host.

## Pending

- `match_preview` does not return the match's club: a match id of club B opened on club A's host gets a preview with A's
  name and timezone (no private data; the page itself 404s). Needs the club in the function, a later migration.
- The old `mark_notifications_read()` can go once the new app is everywhere.

## Deploy order

`migrate.yml` and Vercel run in parallel on merge. If the app is out before the migration, marking avisos read fails
quietly (the bell stays lit) until it lands, and emails have no club slug, which only matters once
`NEXT_PUBLIC_ROOT_DOMAIN` is set. Set the root domain after the migration is in.

## Two auth bugs the e2e found

- `originFromHeaders` took only `localhost` and `127.0.0.1` as local: `norte.localhost` got `https`, Supabase refused the
  redirect and fell back to the Site URL.
- `/auth/callback` redirected to `request.nextUrl.origin`, which in development is the server's hostname
  (`localhost:3000`) even on `norte.localhost:3000`. It now uses the request's host, like the sign-in action.

## Busy times across clubs, on purpose

`loadPlayerContext` (join rules, "Partidos para vos") still reads the player's bookings, match spots and tournament
entries of every club: nobody plays in two clubs at once. Only start and end times are used, never shown. `book_slot`
already refuses a booking at the same time as one in another club (`busy_at_that_time`).

## The old `mark_notifications_read()`

It marks every club's avisos. It stays so the app deployed while the migration runs keeps working; the new app calls the
version with `p_club_id`. It can go in a later migration.

## Local Supabase

`additional_redirect_urls` gained `http://*.localhost:3000/**`. Auth config changes need `npx supabase stop && npx
supabase start`.
