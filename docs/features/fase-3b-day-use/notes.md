---
feature: fase-3b-day-use
type: note
date: 2026-10-01
branch: feat/fase-3b-day-use
---

# fase-3b-day-use — notes

(scratch, observations, links — append as you work)
- Task 25: el espacio antes de «(sin cuenta)» va fuera del `span`: dentro, el nombre accesible de la tarjeta quedaba «Pepe(sin cuenta)».

## 2026-10-02 — ejecución

- **Cortes 1–2 (base):** migraciones `20261002000100`–`140` tal cual el plan. pgTAP completo tres veces seguidas en verde. Un `db reset` falló una vez con `DbSetupError` sin causa en el SQL; el reintento pasó (contenedor local).
- **Cortes 3–4 (dominio, datos, acciones):** sin desvíos. Dependencia nueva `qrcode` (+ `@types/qrcode`), `npm audit` sin vulnerabilidades.
- **Corte 5 (jugador):** sin desvíos.
- **Corte 6 (club):** el desvío de la Task 25 (arriba).
- **Corte 7 (e2e):** `day-use.spec.ts` en verde dos veces seguidas; los 9 flujos e2e en verde.
- **Revisión de disciplina** (`team-reviewer`): sin críticos ni altos. Arreglos en `20261002000150_day_use_review_fixes.sql`, `day_use_review.test.sql` y el espejo TS:
  - **Sellos:** una recompensa usada consume los sellos más viejos que la ganaron (se recorre en orden de fecha; la recompensa cuenta el día que se compró el pase). Antes, un sello viejo que vencía después de usar la recompensa podía dejar sin la siguiente, ya ganada. `stamps` pasa a ser "sellos sin usar"; `day_use_loyalty.test.sql` y `loyalty.test.ts` ajustados a eso. `LoyaltyPass` suma `boughtOn`.
  - El jugador no cancela un pase cuyo horario ya terminó (`in_the_past`); recepción sí (alguien que no vino).
  - El cron bloquea el pase antes de generar sus canchas, mismo orden que guardar la configuración.
  - Cobros: "Jugado sin pagar" solo con pases que ya empezaron; "A devolver" incluye pases cancelados en los últimos 30 días aunque su fecha sea más vieja.
- **Pendiente (seguimiento, no bloquea):** el chequeo del comprobante y el "lo informado cubre una parte, el efectivo el resto" están tres veces (reservas, torneos, day use); conviene un `private.check_receipt_path` compartido. `unpaidPasses`/`passRefunds` repiten la forma de `unpaidEntries`/`entryRefunds`.
