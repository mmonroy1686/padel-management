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

## The club header can't be forged

`proxy.ts` always sets `x-club-slug` from the host, so a header sent by the browser is overwritten. The header is a
convenience, not a security boundary: RLS and the functions check membership per club. Choosing another club's host only
shows that club, as visiting its subdomain would.

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
