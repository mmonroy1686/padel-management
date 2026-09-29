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
