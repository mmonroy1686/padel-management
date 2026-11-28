---
feature: avisos-de-reservas
type: note
date: 2026-11-28
branch: feat/avisos-de-reservas
---

# avisos-de-reservas — notes

- Terminar un turno fijo cancela cada reserva futura (`end_series`). El trigger de `bookings` reconoce ese caso
  (la serie ya terminó antes de esa fecha) y no avisa por cada semana: avisa una vez el trigger de `recurring_series`.
- `match_slots` no se borra al bajarse: `leave_match` y `remove_from_match` ponen `player_id` en null. Por eso
  `match_left` es un trigger de update.
- Local no hay `RESEND_API_KEY`: los avisos quedan `skipped` y no llegan a Mailpit. El e2e verifica la campana
  (/avisos); el mail se arma con las mismas palabras (`notificationContent`) y está cubierto en Vitest.
- `waitlist_rpcs` contaba 1 aviso de Juli: ahora son 2 (el de la lista de espera y el comprobante de la reserva que
  hizo desde ahí). `clubs_columns` suma `reminder_hours` a las columnas que Ajustes escribe.
- Avisos creados en una misma transacción tienen el mismo `created_at`; en /avisos el orden entre ellos no está
  garantizado. En la app real una acción crea a lo sumo un aviso por persona, así que no se nota.
- Las fallas de pgTAP en club_info, day_use_products, integrity, multi_club, notification_outbox, recurring_series y
  tournament_fixture son previas y vienen de los datos locales (demo), no de este cambio.
