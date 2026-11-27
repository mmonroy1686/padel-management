---
feature: americano-parejas-fijas
type: note
date: 2026-11-26
branch: feat/americano-parejas-fijas
---

# americano-parejas-fijas — notes

- `tournament_games` no cambió: con parejas fijas cada partido sigue siendo a1 + a2 contra b1 + b2, solo que a1/a2 y b1/b2 son siempre la misma pareja. El fixture, los resultados, el podio y Cobros funcionan igual.
- El fixture de parejas usa el mismo método del círculo que el americano rotativo, pero sobre las parejas: con 4, 6 u 8 parejas todas se cruzan una vez en parejas − 1 rondas. Los partidos por ronda (jugadores / 4) y las tandas no cambian, así que `tournament_minutes` y el período del torneo tampoco.
- `pair_id` vive en `tournament_entries` (sin tabla aparte): dos inscripciones activas lo comparten. Al darse de baja o ser sacado alguien, `drop_entry` deja a su compañero buscando pareja y le manda el aviso `tournament_pair` (`event: left`).
- El ranking por pareja (`pairRanking`) toma la fila de uno de los dos (suman lo mismo) con el nombre «A y B» y el id de la pareja; `rankingKey` resalta la pareja del jugador.
- El valor `tournament_pair` del enum de avisos va solo en su migración (Postgres no deja usar un valor de enum en la misma transacción que lo agrega).
- La demo suma «Americano de parejas fijas» con inscripción abierta: dos parejas y dos que buscan pareja.
- pgTAP: `tournament_fixture` (test 5), `notification_outbox` y la foto del club en `club_info` fallan si la base local tiene datos de la demo o de e2e: cuentan filas de toda la base. Con la base limpia pasan; no es de este cambio.
