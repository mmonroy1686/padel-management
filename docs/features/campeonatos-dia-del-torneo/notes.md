---
feature: campeonatos-dia-del-torneo
type: note
date: 2026-10-06
branch: feat/campeonatos-dia-del-torneo
---

# campeonatos-dia-del-torneo — notes

(scratch, observations, links — append as you work)

## 2026-10-07 — Ejecución

**Cortes 1 a 6.** Las 27 tareas se aplicaron como estaban en el plan (un script aplicó cada tarea: archivos nuevos, reemplazos y agregados) y cada una pasó sus checks antes del commit. Sin desvíos de comportamiento.

**Corte 7.**
- La demo trae la "Copa de la Casa", jugándose hoy: 7 partidos terminados, 2 en juego y el resto por jugar.
- Al revisar las capturas apareció un detalle: una zona mostraba "Empate a definir" mientras todavía faltaba jugar el partido que lo resuelve. Ahora solo se nombra un empate con la zona completa (`zoneViews`, con su test).
- El e2e nuevo usaba `getByRole('table', { name: 'Fixture' })`, que también agarraba la tabla de la zona ("6ta Fixture"); pasó a `exact: true`.
- En 5 corridas completas de los 12 e2e hubo un fallo intermitente que no se pudo reproducir.

**Revisión de disciplina (`20261007000180_championship_fixture_review_fixes.sql`).**
- `draw_problem` no revisaba toda la forma de la llave. Ahora: con zonas, la llave solo toma lugares de zona (nunca una pareja directa) y exactamente los que clasifican; todo partido antes de la final lleva a uno de la ronda siguiente; un partido por lugar de la llave.
- `schedule_problem` también mira `court_occupancy` fuera del campeonato: una franja devuelta a la grilla y reservada ya no recibe un partido movido.
- Pasar al ganador filtra por campeonato (usa el índice).
- `championship_fixture_review.test.sql` cubre cada caso.

**Pendiente, de baja prioridad (no se arregló):**
- `slotOptions` (TS) todavía ofrece una franja devuelta a la grilla y ocupada; el servidor la rechaza (`courts_busy`).
- El cierre automático de una zona corre en una segunda llamada con el orden calculado en el cliente: si dos personas corrigen la misma zona a la vez, el orden de desempate (games, entre ellos) podría quedar el de la lectura vieja. El servidor sí controla que nadie quede arriba de una pareja con más partidos ganados.
