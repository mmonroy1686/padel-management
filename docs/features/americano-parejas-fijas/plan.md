---
feature: americano-parejas-fijas
type: plan
status: done
date: 2026-11-26
branch: feat/americano-parejas-fijas
references: ./design.md
---

# americano-parejas-fijas — implementation plan

## Build sequence

| # | step | output | testable how |
|---|---|---|---|
| 1 | Base | Migración: enum `tournament_format`, `tournaments.format`, `tournament_entries.pair_id`, regla de rondas por formato, aviso `tournament_pair`. `create_tournament` con `p_format` | pgTAP |
| 2 | Inscripción | `join_tournament_pair`, `drop_entry` que libera al compañero y le avisa, `pair_tournament_entries`, `split_tournament_pair`, `add_tournament_guest` con pareja | pgTAP `tournament_pairs.test.sql` |
| 3 | Fixture | `start_tournament` todos contra todos entre parejas; exige parejas completas | pgTAP |
| 4 | Dominio | `format` y `pairId` en `Tournament`; `tournamentPairs`, `pairRanking`, `tournamentRanking`; textos del aviso; errores; formulario con formato | Vitest |
| 5 | Club | Nuevo americano con «Formato»; gestión con «Pareja», «Juntar con…», «Separar», invitado con pareja; ranking por pareja | Vitest de componentes |
| 6 | Jugador | Detalle con parejas y «Buscan pareja»; hoja de inscripción con compañero o «Busco pareja»; tarjeta y ranking por pareja | Vitest de componentes |
| 7 | e2e y docs | Spec: el admin crea un americano de parejas fijas, un jugador se anota con compañero, el mostrador junta a los que buscan, arma el fixture y aparece el ranking por pareja. notes.md | Playwright |

## Acceptance criteria

- [x] El club elige el formato al crear el americano; los existentes siguen rotando.
- [x] Un jugador se anota con un compañero del club, que recibe un aviso; o se anota buscando pareja.
- [x] El mostrador junta, separa y agrega invitados como pareja.
- [x] No se arma el fixture con alguien sin pareja; con parejas, todas contra todas.
- [x] Ranking, podio y tarjetas por pareja.
- [x] Pasan pgTAP, Vitest, Playwright y el build.

## Plan revisions

(append-only)

- **v1 (2026-11-26)**: initial plan.
