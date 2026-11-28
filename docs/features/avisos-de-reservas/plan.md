---
feature: avisos-de-reservas
type: plan
status: done
date: 2026-11-28
branch: feat/avisos-de-reservas
references: ./design.md
---

# avisos-de-reservas — implementation plan

## Build sequence

| # | paso | salida | se prueba con |
|---|---|---|---|
| 1 | Valores nuevos de `notification_kind` (migración propia: un `add value` no se usa en la misma transacción) | `20261207000100_booking_notification_kinds.sql` | `migration up` |
| 2 | Columnas `clubs.reminder_hours` (grant de update), `bookings.reminded_at`, `profiles.booking_reminders` + `set_booking_reminders(boolean)` | `20261207000110_booking_notifications.sql` | pgTAP |
| 3 | Helpers privados: participantes de un turno y de un partido, quién actuó (`self` / `club` / `player`), insertar un aviso | misma migración | pgTAP |
| 4 | Triggers: `bookings` (insert, cancel), `booking_players` (insert, delete), `recurring_series` (insert), `open_matches` (confirmed, cancelled), `match_slots` (delete), `payments` (confirmed, rejected, refunded) | misma migración | pgTAP `booking_notifications.test.sql` |
| 5 | `private.send_booking_reminders()` + `cron.schedule('booking-reminders', '*/10 * * * *')` | misma migración | pgTAP (ventana, ya avisado, apagado, reservado tarde) |
| 6 | `db:types`; `lib/domain/booking-notifications.ts` (lee y redacta los 11) + `notifications.ts` (contenido, vencido) | TS | Vitest |
| 7 | Mails: saltear direcciones `.test` en `buildEmail` | `lib/notify/messages.ts` | Vitest |
| 8 | Ajustes → Reservas: «Recordatorio por mail» (select); `parseBookingSettings` | forms + settings | Vitest |
| 9 | Perfil: «Recordatorios de turnos por mail» (AutoSaveForm) + acción; Avisos: subtítulo general | UI | Vitest / e2e |
| 10 | e2e: reservar → aviso «Reservaste…» en Avisos y mail en Mailpit; cancelar → aviso | `booking-notifications.spec.ts` | Playwright |
| 11 | Manual: sección «Avisos por mail», Perfil, Ajustes → Reservas; capturas | `docs/manual` + artifact | a ojo |
| 12 | Verificación completa: lint, tsc, Vitest, pgTAP afectados, e2e afectados (los que esperan conteos de avisos), build | — | — |

## Acceptance criteria

- [ ] Cada evento de la tabla del diseño crea un aviso para cada participante con cuenta, y uno solo.
- [ ] Quien actúa recibe el comprobante en segunda persona; los demás ven quién fue.
- [ ] Los turnos de partido no duplican avisos (confirmado/cancelado solo vía partido).
- [ ] El recordatorio sale una vez, respeta `reminder_hours` del club, el interruptor del jugador y no sale si se reservó dentro de la ventana.
- [ ] Los mails a `.test` no se mandan.
- [ ] Manual actualizado y republicado.

## Plan revisions

(append-only)

- **v1 (2026-11-28)**: initial plan.
