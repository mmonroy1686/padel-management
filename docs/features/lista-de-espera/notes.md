---
feature: lista-de-espera
type: note
date: 2026-10-05
branch: feat/lista-de-espera
---

# lista-de-espera — notes

(scratch, observations, links — append as you work)

## 2026-10-05 — Ejecución

**Cortes 1 y 2 (modelo, motor y RPCs).** Los tests pgTAP del plan usaban turnos a las 19:00, pero la grilla del fixture (club T) va de 08:00 cada 90 minutos: 18:30, 20:00, 21:30. Se pasaron a 18:30 y 20:00 (y el rango de "al menos un turno entero" a 18:30–19:30) en `waitlist_offer.test.sql` y `waitlist_rpcs.test.sql`, también en el plan. El motor no cambió.

**Cortes 3 a 6.** Sin desvíos. El header y el layout del jugador se reemplazaron enteros como dice el plan, después de comparar con la versión actual (los PR de tablet y PC no los habían cambiado de forma incompatible).

**Corte 7.** El e2e pasó dos veces seguidas y los 10 flujos juntos.

**Revisión de disciplina (`20261005000160_waitlist_review_fixes.sql`).**
- `claim_slot_hold` copiaba las reglas de `book_slot` y le faltaban la ventana de reserva y la cancha activa. Ahora las dos usan `private.check_online_booking` (pasado, ventana, precio, ocupado a esa hora, tope) y el reclamo además valida la cancha.
- El motor solo ofrece turnos dentro de la ventana de reserva.
- La *outbox* saltea el mail de una retención que ya no está activa (reclamada, rechazada o pasada) y no reintenta ningún mail después del tercer intento (antes los `pending` no tenían tope).
- `waitlist_review.test.sql` cubre los caminos de error del reclamo y que un `offer_freed` que falla no hace fallar la escritura que libera la cancha. `notification_outbox.test.sql` ahora le da al aviso `slot_held` una retención activa.

**Pendiente, de baja prioridad (no se arregló):**
- Si `offer_freed` falla (por ejemplo, un *deadlock* atrapado), ese turno no se ofrece después: no hay barrido. Un `statement_timeout` durante el commit tampoco lo atrapa `when others`.
- Liberar una cancha con un `update` del período (achicar un torneo) no dispara la oferta: el trigger es solo `after delete`.
