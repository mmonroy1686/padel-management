---
feature: historial-jugador
type: note
date: 2026-11-28
branch: feat/historial-jugador
---

# historial-jugador: notas

## Qué quedó

- Migración `20261205000100_booking_results.sql`:
  - Tabla `booking_results` y las funciones privadas `booking_participants` e `is_booking_participant`.
  - RPC `save_booking_result`, `clear_booking_result` y `my_played_bookings`.
  - RLS de lectura para el staff y los jugadores del turno.
- Perfil:
  - «Tus podios» (vitrina) arriba, y un link a «Partidos jugados» con cuántos ganaste.
  - `/perfil/partidos`: la lista de turnos jugados con «Cargar resultado» o «Corregir resultado».
- Grilla del club: el detalle de un turno ya empezado, con los 4 jugadores, muestra el resultado y el mismo
  formulario.
- Los podios se calculan en el servidor (`lib/domain/podiums.ts`), sin tablas nuevas.

## Decisiones

- **El resultado guarda posiciones, no ids.** Un invitado sin cuenta también juega; los nombres salen de las
  posiciones del turno cuando se muestra.
- **La pareja A es la del que carga.** El formulario pregunta «¿Con quién jugaste?» (o con quién jugó el titular,
  para el staff), así los games de la izquierda son siempre «Ustedes».
- **`invalid_sets`, no `invalid_score`:** ese código ya lo usan los americanos con otro mensaje.
- **La vitrina solo la ve el jugador** (pedido de Miguel). Campeonatos con final o grupo único cerrado; americanos
  terminados.

## Verificación

- pgTAP `booking_results` 16/16.
- Vitest 1481/1481, lint y build limpios.
- e2e `booking-result`: un jugador carga el resultado y lo ve en su historial.
