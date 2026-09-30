---
feature: fase-3b-day-use
type: design
status: approved
date: 2026-10-01
branch: feat/fase-3b-day-use
references: ../../plan-general.md, ../../prototipo.html, ../fase-3a-torneos/design.md, ../fase-1-reservas/design.md
---

# fase-3b-day-use — design

## Purpose

Pases diarios para disfrutar Rustic (vestuarios, pileta, cancha libre en ciertos horarios). El club define qué pases ofrece, qué días y horarios y qué canchas bloquean; el jugador compra su pase, recibe un QR y paga como una reserva; recepción escanea el QR o lo busca por nombre y registra el ingreso, que suma un sello. Cada N sellos el jugador gana un descuento que fija el club. "Ya están en el club" muestra quién ingresó hoy. Segunda mitad de la fase 3 del plan general.

## Principles

- **Escrituras solo por funciones de Postgres**, como en las fases 1 a 3a: RPCs `security definer`, `search_path = ''`, errores con `private.fail(code)` traducidos en `lib/domain/errors.ts`. `anon` no ejecuta nada.
- **Los sellos se calculan, no se guardan**: son los ingresos registrados sin recompensa, dentro del vencimiento. Una recompensa es un grupo completo de sellos que todavía no se usó.
- **Las canchas se bloquean como los turnos fijos**: ocupaciones `day_use` generadas por adelantado y extendidas por `pg_cron`; la restricción de exclusión tiene la última palabra.
- **Club único** (`rustic`).

## Decisiones (brainstorm)

| Tema | Decisión |
| --- | --- |
| Alcance | Pases, excepciones por fecha, compra, QR, ingreso, sellos y "Ya están en el club". |
| Cobro | Igual que las reservas: queda debiendo, paga por transferencia con comprobante o efectivo, recepción confirma. Aparece en Cobros. Un pase a $0 (recompensa del 100 %) no pasa por Cobros. |
| Canchas | Cada pase bloquea sus canchas en sus días y horarios. Si una cancha ya está ocupada, ese tramo se saltea y el club ve un aviso. |
| Recompensa | Porcentaje de descuento que fija el club (100 % = gratis). El jugador elige "Usar mi recompensa" al comprar; recepción también puede aplicarla al vender. El day use con recompensa no suma sello. Vale para cualquier pase. |
| Ya están en el club | Aparecen todos por defecto; cada jugador puede ocultarse en su perfil. |
| Cancelar | El jugador o recepción cancelan mientras no se registró el ingreso. Si pagó, va a "Pagos a devolver"; si usó la recompensa, la recupera. |
| Venta en recepción | A un jugador o a alguien sin cuenta (solo nombre, sin sellos). |
| QR | El QR lleva un link al panel del club (`/club/day-use/pase/<código>`). Recepción lo escanea con la cámara del celular; la página es solo para staff. Sin escáner dentro de la app. |
| Sellos | Pelotas de pádel en SVG: vacías con contorno punteado y número, ganadas en ámbar con la costura y una animación corta; al final, un regalo con el descuento ("-100%"). |

## Modelo de datos

- **`day_use_products`**: `club_id`, nombre, precio, `includes text[]`, `weekdays smallint[]` (0 = domingo), `from_time` y `to_time`, `capacity` (cupo por día), `court_ids uuid[]` (puede estar vacío), `is_active`, `sort_order`.
- **`day_use_overrides`**: `product_id`, `date`, `enabled boolean`. Único por pase y fecha. Cambia la regla semanal para ese día.
- **`day_use_passes`**: `club_id`, `product_id`, `date`, `player_id` **o** `guest_name`, `price` (el que corresponde), `discount_percent` (0 si no usó recompensa), `used_reward boolean`, `code` (corto y único por club, por ejemplo `DU-4821`), `status` (`bought`, `inside`, `cancelled`), `source` (`online`, `reception`), `checked_in_at`, `checked_in_by`, `cancelled_at`, `created_by`. Un pase activo por jugador, pase y fecha.
- **Ocupaciones**: `court_occupancy` de tipo `day_use` con `day_use_product_id` (FK, `on delete cascade`) y `note` = nombre del pase. Generadas hasta la ventana de reservas del club; el cron diario las extiende; guardar un pase o una excepción regenera las futuras (borra las que no tienen conflicto y las crea de nuevo, salteando lo ocupado).
- **Pagos**: `payments.day_use_pass_id`; el check pasa a "exactamente uno de reserva, inscripción o pase". Lo que debe un pase = `price × (100 − discount_percent) / 100` − confirmados.
- **Regla de sellos** en `clubs`: `loyalty_enabled`, `loyalty_every` (N), `loyalty_discount_percent` (1 a 100), `loyalty_expiry_months` (null = no vencen).
- **Perfil**: `profiles.show_in_club` (default `true`).

## Funciones (RPC)

**Jugador**
- `buy_day_use(product, date, use_reward)`: ese día hay day use (regla o excepción), dentro de la ventana de reservas, el horario no terminó, hay cupo (`day_use_full`), no tiene ya ese pase ese día (`already_has_pass`); con recompensa, que tenga una (`no_reward`). Devuelve el pase con su código.
- `cancel_day_use(pass)`: el suyo, antes del ingreso. Libera el lugar; si usó recompensa, la recupera; su transferencia informada se rechaza; lo confirmado queda para devolver.
- `report_day_use_transfer(pass, receipt)`: como `report_tournament_transfer`.
- `set_show_in_club(boolean)`.

**Recepción y admin**
- `sell_day_use(product, date, player | guest_name, use_reward)`.
- `check_in_day_use(pass)`: solo el día del pase (`not_today`), una vez (`already_checked_in`), no cancelado.
- `cancel_day_use(pass)` sobre cualquier pase del club antes del ingreso.
- `record_day_use_cash(pass, amount)`; `confirm_payment` acepta pagos de pases.
- `day_use_inside(date)`: quiénes están adentro, para "Ya están en el club" (respeta `show_in_club`; el staff ve a todos).

**Solo admin**
- `save_day_use_product(...)` (crear o editar) y desactivar; `set_day_use_override(product, date, enabled)`; la regla de sellos en Ajustes. Guardar devuelve los tramos que no se pudieron bloquear.

**Errores nuevos**: `day_use_closed`, `day_use_full`, `already_has_pass`, `no_reward`, `already_checked_in`, `not_today`.

**Permisos (RLS)**: los miembros leen pases (productos) y excepciones de su club; cada jugador lee sus propios pases de day use; el staff lee todos. "Ya están en el club" sale de `day_use_inside`, que devuelve solo nombre y pase.

## Sellos

Función pura en TypeScript y su espejo en SQL (`private.loyalty_of(user)`): ingresos (`status = inside`, `used_reward = false`) dentro del vencimiento, contados desde el más viejo; recompensas ganadas = `floor(sellos / N)`, usadas = pases no cancelados con `used_reward` dentro del mismo período, disponibles = ganadas − usadas, progreso = `sellos mod N`. La base tiene la última palabra al comprar.

## Pantallas

**Jugador** (sin pestaña nueva)
- **Inicio**: tarjeta "Day use" con los sellos, el pase de hoy y "Hoy: N en el club, quedan M lugares".
- **`/day-use`**: días de la próxima semana (tachados sin day use); por día, cada pase con horario, precio, qué incluye y cupo con barra; "Comprar pase", "Usar mi recompensa (-X%)"; tus sellos y la regla en palabras; "Ya están en el club".
- **`/day-use/pase/[id]`**: QR grande, código, pase, fecha y horario, estado, pago y "Cancelar pase".
- **Perfil**: "Aparecer en «Ya están en el club»".

**Club**
- Pestaña **Day use** después de Torneos.
- **Hoy**: pases del día con buscador por nombre o código; "Registrar ingreso" o "Adentro", pago, "Cobrar en efectivo"; "Vender pase". Resumen: ingresos de hoy, adentro, recompensas usadas en 30 días.
- **`/club/day-use/pase/[código]`**: lo que abre el QR; quién es, el pase y "Registrar ingreso". Un jugador que la abre va a Inicio.
- **Configuración** (admin): pases (crear, editar, desactivar), calendario de la semana con excepciones por fecha, aviso de canchas ocupadas.
- **Ajustes → Sellos**: activar, cada cuántos, porcentaje, vencimiento.
- **Grilla**: bloque "Day use". **Cobros**: pases impagos y devoluciones con el nombre del pase.

## Tests

- **pgTAP**: esquema y RLS; generación de ocupaciones (días, horario, excepciones, conflictos, regeneración, cron); compra (cupo, repetido, ventana, día cerrado); recompensa (porcentaje, vencimiento, no suma sello, se recupera al cancelar); ingreso (solo ese día, una vez); cancelación con devolución; pagos; "Ya están en el club" con ocultos; staff de otro club; `anon`.
- **Vitest**: sellos, días habilitados con excepciones, textos, fila de sellos, compra, "Mi pase" con QR, buscador, acciones.
- **Playwright**: admin crea un pase; jugador compra y ve su QR; recepción abre el link y registra el ingreso; se suma el sello; con los sellos completos compra con la recompensa.

## Fuera de alcance

Abonos o pases de varios días, escáner dentro de la app, recompensa limitada a un tipo de pase, notificaciones.

## Open questions

- Pases, precios, cupos y regla de sellos reales de Rustic (defaults de ejemplo: "Day use completo" $450, cupo 30, sáb/dom 08:00–12:30; cada 5, 100 %, vencen a los 6 meses).
