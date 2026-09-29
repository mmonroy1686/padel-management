---
feature: fase-1-reservas
type: note
date: 2026-09-29
branch: feat/fase-1-reservas
---

# fase-1-reservas — notes

- 2026-09-29: prototipo agregado como `docs/prototipo.html` (el archivo original se llamaba "Costanera Pádel, prototipo.html"; el club del prototipo es un nombre de ejemplo, la app es para Rustic).
- Del prototipo: turnos 08:00–21:30 cada 90 min, 3 canchas (2 cristal techadas, 1 muro al aire libre), precio $1.200 / $1.600 desde 18:30, tira de 7 días, grilla del club con tipos Reserva / Turno fijo / Bloqueo.
- 2026-09-29: corte 1 terminado (Tasks 1–11). Revisión de disciplina → migración extra `20260929000810_integrity_fixes.sql` con `integrity.test.sql`:
  - `confirm_payment` bloquea la reserva y no confirma por encima del precio ni sobre reservas canceladas; `record_cash` descuenta lo que cubre una transferencia informada; índice único de una transferencia `reported` por reserva.
  - Cancelar una reserva rechaza su transferencia informada ("Reserva cancelada"); los pagos confirmados quedan para devolver.
  - `staff_book`, `block_court` y `create_series` exigen cancha activa; el generador saltea con motivo `court_inactive`.
  - `end_series` no acepta fechas pasadas y nunca alarga una serie; check `ends_on >= starts_on - 1`.
  - `extend_all_series` aísla cada serie (un error inesperado se loguea como warning y no frena al resto).
  - Test de catálogo: `anon` no ejecuta ninguna función de `public`/`private`; `authenticated` no ejecuta los escritores privados. Se revocó el EXECUTE por defecto de `private.handle_new_user()`.
  - Confirmado por Miguel: recepción y admin validan categorías; solo admin cambia roles.
- 2026-09-29: cortes 3 y 4 terminados (Tasks 21–41). Revisión de disciplina → arreglos en commits aparte:
  - `transfer-sheet` lee el comprobante de `input.files` (jsdom serializa los file inputs vacíos en FormData) y usa `aria-required`.
  - E2E: `localSupabase()` se niega a correr contra un Supabase que no sea `localhost`/`127.0.0.1`; la limpieza pagina `listUsers`.
  - `loadDayGrid(club, date, { userId, audience })`: las notas de bloqueo solo viajan al navegador del staff (`toOccupancy`).
  - Migración `20260929000820_save_my_profile.sql`: perfil y categoría se guardan en una transacción; misma categoría conserva la validación.
  - Tests de validación de Server Actions (`tests/unit/lib/actions/server-actions.test.ts`).
  - Cobros lee con `lib/data/payments.ts`; listas "sin pagar" y "a devolver" en `lib/domain/payments-overview.ts`.
  - Pendiente conocido: por RLS, un miembro todavía puede leer `court_occupancy.note` y `created_by` llamando a la API directo (la app ya no los manda). Resolver con columnas por rol o una vista antes de exponer más datos en Realtime.
- 2026-09-29: Miguel aplicó en producción las migraciones de la fase 1 (hasta `20260929000820`) y `seed.sql` con `supabase db push --include-seed` desde la rama, antes del merge. Producción tiene el club `rustic` con los valores del prototipo (transferencia con texto "Datos de prueba"). Consecuencias: no editar migraciones ya aplicadas (solo agregar nuevas); tras el merge `migrate.yml` no encuentra nada pendiente de estas; los datos reales de Rustic entran como migración de datos que actualiza estas filas.
- 2026-09-29: requisito antes del piloto: SMTP propio en Supabase producción (p. ej. Resend) y subir el rate limit de emails. El SMTP por defecto solo envía a miembros del equipo de Supabase y con un límite muy bajo por hora; Miguel lo alcanzó probando el enlace mágico. `sendMagicLink` ahora loguea el código de error y distingue `over_email_send_rate_limit` y `email_address_not_authorized`.
