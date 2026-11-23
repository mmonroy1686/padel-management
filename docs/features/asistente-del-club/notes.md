---
feature: asistente-del-club
type: note
date: 2026-11-23
branch: feat/asistente-del-club
---

# asistente-del-club — notes

- La rama sale de `feat/inicio-cancha` (97450a4) porque usa `Button size="sm"` y `ActionsMenu`. Ese commit todavía no está en main: el PR #28 se mergeó antes.
- Referencia visual: el flyer "Turnos libres" de Bendito Pádel (canchas en columnas, píldoras verde lima, ocupados con una X y el teléfono abajo). Solo como idea del formato; usamos la marca de cada club.

## Decisiones de implementación (2026-11-23)

- La lista para invitar sale de `candidatesFor` (las filas de `slot_candidates`), no de `match_suggestions`: esa corta en 6 y pide un lugar que encaje, y "Invitar a los mejores 8" necesita más.
- `slot_candidates` solo devuelve socios con categoría y con un motivo (jugó ese día y hora o suele estar libre), para que las ~40 llamadas del día sean livianas.
- El flyer no muestra los horarios pasados: sus celdas son libre, ocupado o sin turno.
- `match_invites` guarda también `club_id`, para su RLS como el resto de las tablas.
- `clubs.phone` se valida con `^[0-9]{8,15}$`; la app normaliza con `normalizePhone`.
- Un libre pasado el cierre de partidos se ve libre en el tablero, pero no se puede tocar para armar.
- El tablero y los recomendados viven en `lib/domain/assistant-board.ts`; `slot-planner.ts` queda para los candidatos de un hueco.
- El e2e toca la celda del tablero, no un recomendado: los recomendados dependen de todos los socios de la base compartida.
- La pestaña "Asistente" va después de "Grilla", con el ícono `racket`.
- El flyer usa Barlow Condensed ExtraBold (`assets/fonts`, licencia OFL), la fuente de títulos del panel; `next.config.ts` la incluye en el trace de la ruta del flyer.
- El tablero usa columnas de mínimo 6rem para que 3 canchas entren en un celular sin scroll horizontal; con muchas canchas el contenedor hace scroll.
- `championship-day.spec.ts` se actualizó al nuevo texto del paso ("Siguiente paso: publicar el fixture") de la reorganización de campeonatos.
