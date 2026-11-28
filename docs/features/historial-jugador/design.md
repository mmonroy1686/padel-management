---
feature: historial-jugador
type: design
status: approved
date: 2026-11-28
branch: feat/historial-jugador
---

# historial-jugador: diseño

## Para qué

Que el jugador vea lo que logró en el club: sus podios (vitrina) y los partidos que jugó con su resultado.
Aprobado por Miguel el 28/11:

- **Vitrina:** muestra solo los podios propios del jugador, en su Perfil.
- **Resultados:** parejas y sets, sin confirmación. Lo carga cualquiera de los 4 jugadores del turno o el staff, y
  cualquiera de ellos lo puede corregir.
- **Uso:** historial personal. No cambia categorías ni rankings.

## Vitrina de podios

- **Campeonatos:**
  - Con eliminación: la final da campeón y finalista; los que pierden la semifinal, 3°.
  - Grupo único (todos contra todos): los puestos 1 a 3 del grupo cerrado.
  - Cuenta solo cuando la final tiene ganador, o el grupo tiene sus puestos.
- **Americanos terminados:** puestos 1 a 3 del ranking final; con parejas fijas, el de la pareja.
- Se calcula en el servidor con lo que ya existe (fixture, ranking): no hay tablas nuevas.
- **Perfil:** «Tus podios» arriba, con las medallas (1°, 2°, 3°) y una fila por podio: puesto, torneo, categoría,
  compañero y fecha. Sin podios, una línea que invita a anotarse.

## Resultados de turnos

- **Tabla `booking_results`:** `booking_id` como clave, la pareja A como dos posiciones del turno (1 a 4) y los games
  de cada set de cada pareja. Guarda quién la cargó y cuándo.
- **Quién juega:** las posiciones del turno.
  - En un turno común, la 1 es el titular y las 2 a 4 salen de `booking_players`.
  - En un partido abierto salen de `match_slots`, que ya trae las parejas.
  - Hace falta tener a los 4 jugadores cargados.
- **RPC:**
  - `save_booking_result(booking, team_a, games_a, games_b)`:
    - Solo para un participante registrado o el staff.
    - Solo con el turno confirmado y ya empezado.
    - De 1 a 3 sets, sin empates, con un ganador.
  - `clear_booking_result(booking)`.
  - `my_played_bookings(club, limit)`: los turnos jugados del que mira, con los 4 jugadores y su resultado.
- **Lectura:** RLS para el staff del club y los participantes del turno.
- **Perfil:**
  - Arriba, «Partidos jugados: 12 · ganaste 7», con link a `/perfil/partidos`.
  - En esa página, la lista de turnos jugados con el resultado o el botón «Cargar resultado». El formulario elige
    quién fue tu compañero y carga los sets.
- **Grilla del club:** en el detalle de un turno que ya se jugó, el mismo formulario para recepción.

## Errores nuevos

- `not_played_yet`: «Ese turno todavía no se jugó.»
- `incomplete_players`: «Faltan jugadores en el turno: cargá los 4 para anotar el resultado.»
- `invalid_sets`: «Revisá los sets: cada uno con un ganador, y el partido también.»

## Fuera de alcance

- Que el rival confirme el resultado.
- Rankings o categorías a partir de resultados.
- Que otros vean tu vitrina.
