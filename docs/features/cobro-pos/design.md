---
feature: cobro-pos
type: design
status: approved
date: 2026-11-24
branch: feat/cobro-pos
references: ../../handoff/2026-11-23-validacion-y-multi-club.md
---

# cobro-pos — diseño

## Para qué

Muchos jugadores pagan con tarjeta en el mostrador, y hoy recepción no tiene cómo registrarlo: lo anota como efectivo o
no lo anota, y la caja no cierra. Con este corte, el club activa **POS** en Ajustes y recepción cobra con POS en los
mismos lugares donde hoy cobra en efectivo. Cobros separa lo que entró en efectivo (lo que tiene que haber en la caja)
de lo que entró por POS.

## Principios

- **POS es como el efectivo:** lo registra recepción, queda confirmado en el acto, sin comprobante. No hay pago con
  tarjeta desde la app ni integración con el POS: recepción pasa la tarjeta en su terminal y toca **POS**.
- **Un solo camino por cobro:** las funciones de cobro en efectivo que ya existen pasan a recibir el medio
  (`cash` o `card`). No se duplica ninguna función.
- **Solo lo que el club acepta:** el botón **POS** aparece solo si el club lo tiene activo, y la base lo rechaza con
  `method_disabled` si no.

## Datos

- Migración 1, sola (Postgres no deja usar un valor nuevo de enum en la misma transacción que lo agrega):
  `alter type public.payment_method add value 'card'`.
- Migración 2:
  - `clubs.accepts_card boolean not null default false`. El check de «al menos un medio» pasa a contar los tres.
  - `private.chargeable_booking` (lo usan `charge_booking_share` y `charge_booking_rest`, los cobros del Inicio)
    acepta `card` y falla con `method_disabled` si el club no lo tiene.
  - `record_cash`, `record_tournament_cash`, `record_day_use_cash` y `record_championship_cash` suman un parámetro
    `p_method public.payment_method default 'cash'`. Aceptan `cash` o `card`; `transfer` da `invalid_input` (una
    transferencia se confirma desde Cobros, como hoy). Cada una valida su medio contra el club.
  - Los nombres no cambian: el parámetro por defecto mantiene el comportamiento actual, y la migración reemplaza la
    firma vieja (drop + create con los mismos grants).
- Devolver un pago con POS funciona como cualquier otro pago (`refund_payment` no mira el medio).

## Recepción

- **Inicio del club** (cobro de partes): la elección de medio (`ChargeChoice`) suma **POS** a «Efectivo» y «Me
  transfirió».
- **Grilla, Cobros, torneos, campeonatos y day use:** donde hoy hay un botón de cobro en efectivo, aparece un botón
  por cada medio de mostrador que el club acepta: **Efectivo** y/o **POS**. Si acepta solo uno, queda un solo botón,
  como hoy.
  - Un tipo compartido `DeskMethod = 'cash' | 'card'` y una función `deskMethods(club)` arman esa lista; la usan
    todas las pantallas.
  - Las acciones leen el medio del formulario (`method`) y lo validan antes de llamar a la base.
- **Cobros:**
  - Cada pago cobrado muestra su medio: «Efectivo», «POS» o «Transferencia».
  - Los totales de «Cobrado» y «Devuelto» separan «en efectivo» (lo que tiene que estar en la caja) y «por POS».

## Ajustes

- **Pagos** (y el paso **Cobros** del asistente de alta, que usa el mismo formulario): una casilla nueva, «POS
  (tarjeta en recepción)». Sigue haciendo falta al menos un medio activo.

## Jugador

- El jugador no paga con POS desde la app. Donde hoy dice cómo se paga, el texto pasa a contar el POS:
  «Se paga en el club (efectivo o tarjeta)», «… o por transferencia», según lo que acepte el club.

## Tests

- **pgTAP:**
  - Recepción cobra con POS una reserva, una parte del Inicio, un torneo, un campeonato y un day use: el pago queda
    `confirmed`, con `method = 'card'`.
  - Con `accepts_card` apagado, cada uno da `method_disabled`.
  - Un jugador no puede registrar un cobro con POS (`forbidden`).
  - `transfer` en las funciones de mostrador da `invalid_input`.
  - El club no puede quedar sin ningún medio; con solo POS, sí.
- **Unit:** `deskMethods`; el texto de medios para el jugador; los totales de Cobros por medio; el parser de Ajustes
  con POS; las acciones pasan el medio.
- **e2e:** el admin activa POS; recepción cobra una parte con POS desde el Inicio y la ve en Cobros con «POS».

## Fuera de alcance

- Integración con el terminal del POS o con un procesador de pagos.
- Pago con tarjeta desde la app.
- Recargo o comisión por tarjeta.
- Distinguir débito y crédito.

## Preguntas abiertas

Ninguna que bloquee. Valores elegidos, que se pueden cambiar: el nombre «POS» en los botones (en el mostrador se dice
así), y que los cobros en mostrador sigan sin comprobante.
