---
feature: campeonatos-inscripcion
type: note
date: 2026-10-06
branch: feat/campeonatos-inscripcion
---

# campeonatos-inscripcion — notes

(scratch, observations, links — append as you work)

## 2026-10-06 — Ejecución

**Corte 1 (modelo).** El helper `helpers/championship.psql` aparece dos veces en el plan (la Task 8 le agrega `blocks`): se extrajo la primera versión en la Task 2 y se agregó el bloque en la Task 8. Sin otros desvíos.

**Corte 2 (RPCs).** Sin desvíos: todos los pgTAP en verde a la primera, y el conjunto completo dos veces seguidas.

**Cortes 3 a 6.** Sin desvíos de comportamiento. `lib/domain/championships.ts` tiene tres bloques en el plan (el archivo y dos "Append to"); se aplicaron en sus tareas. La página de torneos del club se reemplazó entera después de compararla con la actual.

**Corte 7.** El e2e pasó a la primera; los 11 flujos, dos veces seguidas.

**Revisión de disciplina (`20261006000180_championship_review_fixes.sql`).**
- `championship_entries` se leía entera: cualquier socio podía pedir por la API la nota de recepción y la nota de horarios de otras parejas. Ahora esas dos columnas quedan fuera del `grant`; staff y la pareja las leen con `championship_entry_notes`, y `lib/data/championships.ts` las trae solo en el detalle (`loadChampionship`).
- `normalize_phone` (y `normalizePhone`) pasan un celular sin el 0 inicial (`99 222 333`) a `099222333`: antes eran dos jugadores.
- `move_championship_entry` vuelve a leer la categoría de la pareja después de tomar el candado, para que dos movimientos a la vez rellenen la categoría correcta.
- `championship_review.test.sql`: staff de otro club recibe `forbidden`, y `authenticated` no ejecuta ningún helper privado de campeonatos.

**Pendiente, de baja prioridad (no se arregló):**
- Una pareja que ya pagó y se mueve o fusiona a una categoría llena queda en espera: su pago no aparece en "A devolver" hasta que la saquen. Tampoco la diferencia si se la mueve a una categoría más barata.
- En `set_entry_unavailability` el estado de la pareja se lee antes del candado: una pareja dada de baja en ese mismo instante puede guardar sus horarios (sin efecto práctico).
