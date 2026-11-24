---
feature: cobro-pos
type: note
date: 2026-11-24
branch: feat/cobro-pos
---

# cobro-pos — notas

## Decisiones durante la implementación

- **El enum va solo en su migración** (`20261127000100`): Postgres no deja usar un valor de enum agregado en la misma
  transacción, y la siguiente migración lo usa en las funciones.
- **Las funciones `record_*_cash` conservan el nombre** y suman `p_method` con `cash` por defecto. Así no cambia ningún
  llamado existente ni los grants; el nombre queda un poco corto («cash» que también cobra POS), pero renombrar cinco
  funciones públicas no valía el riesgo.
- **Dos chequeos en la base:** `private.check_club_method` (el club acepta ese medio) y `private.check_desk_method`
  (además, solo efectivo o POS: una transferencia la informa el jugador). Los cobros del Inicio usan el primero, porque
  ahí recepción también confirma una transferencia que le muestran.
- **En la app, el medio es obligatorio** (`readDeskMethod`): un formulario sin `method` da `invalid_input`, para que
  uno que se olvide el campo no registre como efectivo plata que entró por POS. En la base, el parámetro sigue teniendo
  `cash` por defecto, para no romper llamados viejos durante el deploy.
- **`DeskCharge`**: un botón por medio de mostrador. Con solo efectivo queda el mismo «Cobrar $400» de siempre; con los
  dos, «Cobrar $400 en efectivo» y «Cobrar $400 con POS». En Cobros, la fila muestra «Efectivo» y «POS».

## Desvío del plan

- **El e2e cobra desde Cobros, no desde el Inicio.** El Inicio solo muestra el turno que se está jugando ahora, así que el
  test dependería de la hora a la que corre (el de Inicio ya se saltea fuera de horario). Cobros lista lo jugado en los
  últimos 30 días, así que el test es estable. El cobro con POS desde el Inicio queda cubierto por pgTAP
  (`charge_booking_share` con `card`) y por Vitest (`ChargeChoice`, `chargeShare`).
- **El e2e corre en Pádel Norte**: los tests corren en paralelo, y prender POS en Rustic cambiaría los botones que
  otros tests tocan. Al terminar vuelve a apagar POS en Norte.

## Revisión (team-reviewer)

- Aplicado: el texto de Términos ahora nombra la tarjeta; pgTAP suma privilegios de las firmas nuevas (anon no cobra,
  authenticated no ejecuta los chequeos privados), un jugador contra `record_cash`, `charge_booking_rest` con POS, el
  medio nulo y una llamada sin medio; el medio pasó a ser obligatorio en la app; limpieza de `deskChargeLabel`,
  `deskChargeDone` y el tipo de medios del club.
- El test pgTAP de totales filtra por sus propias filas: la base local con datos de e2e lo rompía.

## Verificación

- pgTAP: `card_payments.test.sql` (27); suite completa 1339 en verde.
- Vitest 1293, lint, typecheck y build en verde.
