---
feature: metricas-piloto
type: note
date: 2026-11-25
branch: feat/metricas-piloto
---

# metricas-piloto: notas

## Qué se construyó

- `docs/piloto/metricas.sql`: las 7 consultas del diseño.
  - Cada una se corre sola, porque el SQL Editor de Supabase muestra solo el resultado de la última consulta. Por eso cada consulta repite su encabezado: el club, por slug, y las 8 semanas en su zona horaria.
  - Las ocupaciones de `court_occupancy` no se superponen en una misma cancha (constraint de exclusión), así que la ocupación es la suma de las intersecciones con cada franja. Los bloqueos (`block`) y las retenciones (`hold`) no cuentan.
  - Las franjas se cortan con el horario de hoy del club. Si el club cambia el horario, las semanas viejas se recalculan con el nuevo.
  - Las cancelaciones tardías se miden con el `cancellation_notice_hours` de hoy, por el mismo motivo.
  - Jugadores activos cuenta varias actividades:
    - el titular de la reserva y los compañeros cargados (`booking_players`);
    - los partidos abiertos sin cancelar;
    - los day use;
    - los torneos, por su fecha;
    - los campeonatos, por la fecha de inscripción, porque duran varios días.
- «No vino»:
  - Migración `20261129000100_no_show.sql`: columnas `bookings.no_show_at` y `no_show_by`, y la RPC `mark_no_show`.
  - En la grilla del club, el detalle de una reserva que ya empezó muestra el botón «No vino», o «Marcada: no vino» con «Deshacer».
  - En los partidos abiertos no aparece: el diseño lo deja solo para las reservas de cancha.

## Verificación

- pgTAP `no_show.test.sql` (13, después 17):
  - permisos: el jugador y el staff de otro club no pueden marcar;
  - estados: falla con una reserva futura o cancelada;
  - marcar y deshacer funcionan;
  - marcar dos veces conserva la primera marca;
  - la cancha sigue ocupada;
  - el check de las columnas y la escritura directa (42501).
- Vitest: el detalle de la reserva (3 tests nuevos) y la acción `markNoShow` (2).
- `metricas.sql` contra el seed local (`demo:data`):
  - las 7 consultas corren sin errores;
  - con `norte` no aparece nada de Rustic;
  - con una reserva marcada «No vino» en una transacción descartada, la consulta 7 cuenta 1.

## Arreglos de la revisión

- `mark_no_show` rechaza las reservas de partidos abiertos (`invalid_state`): el diseño deja «No vino» solo para
  reservas de cancha, y la consulta 7 ya no las cuenta en el denominador.
- Una reserva marcada «No vino» ya no ofrece «Cancelar reserva»: cancelarla la pasaría a las cancelaciones, sacaría
  su ocupación y la quitaría de los faltazos.
- Consulta 3: separa las cancelaciones del jugador de las del club; solo las del jugador pueden ser tardías.
- Consulta 4: un turno recuperado que después se canceló no cuenta.
- Consulta 5: los campeonatos cuentan solo las parejas activas o en espera.
- Consulta 6: aclara que un cobro devuelto sale de su semana y aparece en la semana de la devolución, porque al
  devolver se pisa `confirmed_at`.
- pgTAP: 4 casos más (id desconocido, `null`, deshacer sin marca, partido abierto). Total 17.
