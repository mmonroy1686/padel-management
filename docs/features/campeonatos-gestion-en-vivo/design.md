---
feature: campeonatos-gestion-en-vivo
type: design
status: approved
date: 2026-10-07
branch: feat/campeonatos-gestion-en-vivo
references: ../campeonatos-dia-del-torneo/design.md, ../campeonatos-inscripcion/design.md
---

# campeonatos-gestion-en-vivo — design

## Purpose

Hacer usable la gestión de un campeonato el día del torneo: la página del club está toda junta en una sola página larga; falta encontrar rápido a un jugador y su pareja; y los resultados solo aparecen al terminar un partido. Tres mejoras: pestañas en la página del club, un buscador de jugador con su ficha (club y página pública) y un marcador en vivo que recepción carga game a game y se ve en el modo TV y la página pública.

## Principles

- **Reglas en Postgres**: el marcador en vivo se recalcula en la base desde un registro de games (`championship_live_games`), con RPCs `security definer`, `search_path = ''` y `private.fail(code)`. Solo staff del club.
- **Nada nuevo para `anon`**: la página pública sigue leyendo solo `public_championship(code)`, que ahora también trae el set en curso.
- **El buscador no consulta nada nuevo**: busca sobre lo que la página ya cargó (club: `loadChampionship` + `loadFixture`; pública: `public_championship`).
- **Reutilizar**: `MatchLine` (marcador), `BottomSheet`, `DataTable`, `normalizeText`, las pestañas como links con `?ver=`.

## Decisiones (brainstorm)

| Tema | Decisión |
| --- | --- |
| Marcador en vivo | Botones "+1" por pareja y "Deshacer". El set se cierra solo (6 con 2 de diferencia; en 6-6 el siguiente +1 es el tie-break, 7-6). Tercer set súper tie-break: puntos a 10 por 2. Con límite de tiempo, se termina con el marcador como esté. |
| Terminar | Con el partido definido aparece "Terminar partido con 6-4 6-3" (usa `record_match_result`, mismo avance). Se puede terminar a mano antes (abandono) o usar "Cargar resultado" como siempre. |
| Página del club | Pestañas en la misma página con link (`?ver=hoy|fixture|zonas|parejas|ajustes`); por defecto según el estado. |
| Buscador | En el club y en la página pública; la ficha pública no muestra pago, horarios ni teléfonos. |

## Marcador en vivo

- **`championship_live_games`**: `match_id`, `club_id`, `seq` (orden), `side` (`a`/`b`), `created_by`, `created_at`. Único `(match_id, seq)`.
- **`championship_match_sets`** suma `in_progress boolean default false`: el set que se está jugando.
- **`private.live_sets(match)`**: recorre los games en orden con las reglas de la categoría y devuelve los sets (cerrados y, si lo hay, uno en curso) y si el partido quedó definido (2 sets ganados; con súper tie-break el tercero es a puntos). En 6-6 el siguiente game cierra 7-6 (tie-break). Un +1 sobre un partido ya definido se rechaza (`invalid_state`).
- **RPCs** (staff del club, partido `playing`; `start_match` sigue igual): `score_live_game(match_id, side)` agrega el game, recalcula y reescribe los sets del partido; `undo_live_game(match_id)` borra el último y recalcula. Devuelven los sets y `decided`.
- **Terminar**: "Terminar partido" manda los sets cerrados a `record_match_result` (que valida, define el ganador y avanza). `record_match_result` y `record_walkover` borran los games en vivo del partido (el resultado final manda).
- **`public_championship`** incluye `in_progress` en cada set.
- **Pantallas**: `MatchLine` muestra el set en curso con borde ámbar y un punto "en vivo". La pestaña Hoy muestra, en cada partido en juego, "+1" grande por pareja, "Deshacer" y, cuando está definido, "Terminar partido con …".

## Pestañas del club

- Encabezado fijo: nombre, estado, "Compartir", "Abrir modo TV" y el buscador.
- Pestañas (links con `?ver=`, `aria-current`; en el celular la barra se desliza):
  - **Hoy** (publicado o en juego): en juego con el marcador en vivo; próximos con "Empezar"; terminados con "Corregir".
  - **Fixture**: tabla de partidos con filtros; antes de publicar, "Sortear", "Programar", "Publicar" y los partidos sin ubicar.
  - **Zonas y llaves**: filtro por categoría arriba (una a la vez).
  - **Parejas**: tablas por categoría, "Cargar pareja", lista de espera, categorías con pocas parejas.
  - **Ajustes**: datos, afiche, días de juego y categorías (en borrador) y "Cancelar campeonato" al final, separado.
- Por defecto: borrador → Ajustes; inscripción → Parejas; cerrado o sorteado → Fixture; publicado o en juego → Hoy; finalizado → Zonas y llaves. Una pestaña que no corresponde al estado no se ofrece.

## Buscador de jugador

- Campo "Buscar jugador" con resultados mientras se escribe (`normalizeText`, todas las palabras): parejas que coinciden con su categoría ("Ana Pérez y Pedro Viera · 6ta Libre"). Un jugador en dos categorías aparece en las dos.
- La ficha (ventana): la pareja, la categoría y su situación (con lugar, en espera, en zona, en la llave, eliminada, campeona); sus partidos (jugados con marcador, en juego en vivo, próximos con día, hora y cancha); su zona con su fila resaltada; dónde está en la llave y contra quién jugaría si gana. En el club, además, el pago con "Cobrar", los horarios imposibles y los teléfonos.
- Página pública: el mismo buscador y ficha sin pago, horarios ni teléfonos.
- Lógica pura en `lib/domain/championship-search.ts` (buscar parejas, armar la ficha), con Vitest.

## Tests

- **pgTAP**: +1 cierra el set en 6-4, 7-5, el tie-break en 6-6 y el súper tie-break a 10; "Deshacer"; solo staff del club; un partido que no está en juego (o ya definido) no acepta +1; terminar guarda el resultado, avanza y borra los games en vivo; `public_championship` trae `in_progress`.
- **Vitest**: marcador con set en curso; pestañas y la de por defecto según el estado; buscador sin acentos; ficha del club con pago y teléfonos, la pública sin ellos.
- **Playwright**: recepción carga games con +1 y, sin terminar, la página pública muestra el parcial; lo termina y la pareja ganadora aparece en la llave.

## Fuera de alcance

- Punto a punto (15, 30, 40).
- Carga del marcador por jugadores.
- Recálculo de horarios por demoras.
