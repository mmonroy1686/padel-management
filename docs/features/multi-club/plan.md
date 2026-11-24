---
feature: multi-club
type: plan
status: done
date: 2026-11-24
branch: feat/multi-club
references: ./design.md
---

# multi-club — implementation plan

## Build sequence

| # | step | output | testable how |
|---|---|---|---|
| 1 | Club from the host: `lib/club/host.ts`, `proxy.ts` header, `findClub`/`getClub`, 404 page, request origin for links; `CLUB_SLUG` goes | app reads the host's club | unit (`host.test.ts`), smoke e2e on the default club |
| 2 | Migration `20261124000100_multi_club_functions`: slug in `claim_notification_emails` and `public_championship`; `mark_notifications_read(p_club_id)`; second club in the seed | DB knows each row's club | pgTAP `multi_club.test.sql`, `championship_public` |
| 3 | App per club: emails link to their club, Mis reservas and the bell per club, championship page redirects to its owner | nothing mixes | unit (notify, actions, public parser) |
| 4 | Local dev and demo: Supabase redirect for `*.localhost`, `--club` in demo scripts, e2e helpers per club | two clubs locally | e2e `multi-club.spec.ts` |
| 5 | README, `.env.example`, notes | Miguel's steps | review |

## Acceptance criteria

- [x] `rustic.localhost:3000` and `norte.localhost:3000` each show their own club; a player of both sees only each one's.
- [x] pgTAP for every new or changed function.
- [x] e2e: booking in A, welcome and booking in B, each club's list only its own; one session per club.
- [x] Without a subdomain, `DEFAULT_CLUB_SLUG=rustic`: every current e2e unchanged.
- [x] Unknown subdomain → 404 "Club no encontrado".
- [x] No fixed club left (`grep -rnw CLUB_SLUG` empty).

## Plan revisions

- **v1 (2026-11-24)**: initial plan. Busy times stay across clubs (design §6).
