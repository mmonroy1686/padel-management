---
feature: fase-1-reservas
type: design
status: design
date: 2026-09-29
branch: feat/fase-1-reservas
references: ../../plan-general.md, ../../prototipo.html, ../fase-0-base/design.md
---

# fase-1-reservas — design

## Purpose

Reemplazar el ida y vuelta por WhatsApp para reservar cancha en Rustic Pádel. El jugador ve los turnos libres, reserva, cancela dentro del plazo e informa su transferencia. Recepción maneja la grilla del día en vivo, carga reservas a nombre de quien sea, turnos fijos y bloqueos, confirma cobros y valida categorías. El admin configura canchas, turnos, precios y reglas. Es la fase que más valor da desde el primer día (ver [plan general](../../plan-general.md)).

Referencia visual y de flujos: [docs/prototipo.html](../../prototipo.html) (pantallas Reservar, Perfil y Panel del club: Grilla y Calendario).

## Decisiones tomadas en el brainstorm (2026-09-29)

| Tema | Decisión |
| --- | --- |
| Alcance | Toda la fase 1 en un solo diseño, entregada en cortes chicos dentro de la rama |
| Turnos | Grilla fija por club: `opens_at` + n × `slot_minutes`, sin inicio libre |
| Cobro | Entra en la fase 1: efectivo y transferencia con comprobante, confirmados por recepción |
| Reserva sin pagar | Ocupa la cancha al instante; el pago se registra antes o después de jugar |
| Turnos fijos | Los carga recepción; pueden quedar asociados a un jugador o a un nombre |
| Pantallas del club | Grilla, Calendario mes/semana, Cobros, Jugadores, Ajustes; grilla en vivo con Realtime |
| Perfil del jugador | Nombre, lado, mano, categoría (autodeclarada, la valida el club), visibilidad |
| Arquitectura | Enfoque A: funciones de Postgres atómicas llamadas desde Server Actions |
| Clubes | Un solo club (Rustic). `club_id` sigue en el modelo; no hay flujos multi-club |

## Principles

- **La base garantiza las reglas.** Reservar, cancelar, cargar turnos fijos y cobrar son funciones de Postgres atómicas. Crean la reserva y su ocupación en la misma transacción, calculan el precio y validan permisos. El cliente nunca manda el precio ni escribe directo en `bookings` o `court_occupancy`.
- **`court_occupancy` es lo que ocupa la cancha hoy; el historial vive en `bookings`.** Cancelar marca la reserva como cancelada y borra su ocupación (decisión de la fase 0).
- **La app no mueve dinero.** Registra quién pagó, cómo, cuánto y quién lo confirmó.
- **Toda regla que afecta al jugador se explica en el momento** (precio, cómo se paga, plazo de cancelación), como pide el plan general.

## Modelo de datos

Se suma a las tablas de la fase 0 (`clubs`, `courts`, `profiles`, `club_members`, `court_occupancy`).

### `clubs` (columnas nuevas)

| Columna | Default | Uso |
| --- | --- | --- |
| `slot_minutes` | 90 | Duración del turno. Turnos = `opens_at` + n × `slot_minutes` mientras el turno termine antes o justo en `closes_at` |
| `max_active_bookings` | 2 | Reservas futuras confirmadas que un jugador puede tener a la vez |
| `accepts_cash`, `accepts_transfer` | true, true | Medios de pago habilitados |
| `transfer_details` | null | Texto libre con banco, cuenta y titular que ve el jugador |
| `transfer_receipt_required` | true | Si "ya transferí" exige subir comprobante |

Se eliminan `min_booking_minutes` y `max_booking_minutes` (fase 0): con grilla fija, la regla pasa a ser "el turno calza exacto en la grilla". Siguen `opens_at`, `closes_at`, `booking_window_days` y `cancellation_notice_hours`. Con 08:00–23:00 y 90 min, los turnos son 08:00 … 21:30, como el prototipo.

### Tablas nuevas

- **`pricing_rules`**: `club_id`, `weekdays smallint[]`, `from_time`, `to_time`, `price integer` (pesos). El precio de un turno sale de la regla que cubre su hora de inicio en su día de la semana. Sin regla, el turno no se puede reservar. Prototipo: $1.200, y $1.600 desde las 18:30.
- **`bookings`**: `club_id`, `court_id`, `period`, titular (`player_id` **o** `guest_name`, exactamente uno), `source` (`online` | `reception`), `series_id` (nullable), `status` (`confirmed` | `cancelled`), `price` (congelado al reservar), `occupancy_id` (null tras cancelar), `created_by`, `cancelled_at`, `cancelled_by`, `created_at`.
- **`recurring_series`**: `club_id`, `court_id`, `weekday`, `start_time`, titular (`player_id` o `guest_name`), `starts_on`, `ends_on` (nullable), `created_by`. Genera reservas 8 semanas adelante; `pg_cron` las extiende todos los días. Las fechas que chocan con otra ocupación se saltean y se informan a recepción.
- **`payments`**: `club_id`, `booking_id`, `method` (`cash` | `transfer`), `amount`, `status` (`reported` | `confirmed` | `rejected` | `refunded`), `receipt_path`, `reported_by`, `confirmed_by`, `confirmed_at`, `rejection_reason`, `created_at`. Una reserva está **pendiente de pago** mientras sus pagos `confirmed` no sumen su precio.

### Cambios menores

- `court_occupancy.note`: motivo de un bloqueo.
- Storage: bucket privado `receipts`, un prefijo por usuario (`receipts/<user_id>/…`). El jugador sube y lee lo suyo; recepción y admin leen todo.
- Categoría: la sigue guardando `club_members` (`category`, `category_validated`). El jugador la cambia solo con `set_my_category`, que vuelve a dejar `category_validated = false`.

## Operaciones en la base

Funciones `security definer` en `public` (expuestas como RPC), con `search_path = ''` y chequeo explícito de rol. Después de esta fase, `authenticated` pierde los INSERT/UPDATE/DELETE directos sobre `bookings`, `court_occupancy` y `payments`; solo quedan las funciones.

### Jugador

| Función | Reglas |
| --- | --- |
| `book_slot(court_id, starts_at)` | Miembro del club; turno alineado a la grilla; a futuro y dentro de `booking_window_days`; sin otra reserva propia a esa hora; menos de `max_active_bookings`; con precio. Crea reserva y ocupación. Devuelve la reserva |
| `cancel_my_booking(booking_id)` | Solo propias y con `cancellation_notice_hours` de aviso |
| `report_transfer(booking_id, receipt_path)` | Solo propias; comprobante obligatorio si el club lo exige; el path tiene que estar bajo `receipts/<auth.uid()>/` |
| `set_my_category(category)` | 1 a 8; deja la categoría pendiente de validación |

### Recepción y admin

| Función | Reglas |
| --- | --- |
| `staff_book(court_id, starts_at, player_id \| guest_name)` | Turno alineado a la grilla; sin límite de ventana ni de aviso |
| `cancel_booking(booking_id)` | Cualquier reserva del club |
| `block_court(court_id, starts_at, ends_at, note)` / `unblock(occupancy_id)` | Bloqueos de cualquier duración |
| `create_series(court_id, weekday, start_time, titular, starts_on, ends_on)` | Devuelve las fechas salteadas por choque |
| `end_series(series_id, from_date)` | Cancela las reservas futuras de la serie desde esa fecha |
| `record_cash(booking_id, amount)` | Pago en efectivo ya confirmado |
| `confirm_payment(payment_id)` / `reject_payment(payment_id, reason)` | Sobre transferencias informadas |

### Solo admin

- `validate_category(user_id, category)` y `set_member_role(user_id, role)`.
- Configuración del club, canchas y precios: UPDATE/INSERT directos con RLS de admin.

### Errores

Cada función falla con un código estable en el mensaje: `slot_taken`, `not_aligned`, `in_the_past`, `outside_window`, `notice_period`, `no_price`, `too_many_bookings`, `busy_at_that_time`, `receipt_required`, `forbidden`. El choque de la exclusión (23P01) se traduce a `slot_taken`. La app traduce cada código a un texto en español (`lib/domain/errors.ts`).

### Tareas programadas

- `pg_cron` diario: extiende todas las series activas hasta 8 semanas adelante.

## Pantallas

### Jugador (`app/(jugador)`, barra inferior: Inicio, Reservar, Mis reservas, Perfil)

- **`/bienvenida`**: alta obligatoria la primera vez. Nombre, lado, mano y categoría, con el aviso de que el club la valida.
- **`/` Inicio**: saludo con categoría y lado; próxima reserva; accesos rápidos ("N turnos libres hoy").
- **`/reservar`**: tira de 7 días, grilla de turnos por cancha, "Solo libres", pasados ocultos y leyenda. Un turno libre abre una hoja con cancha, horario y precio, "Se paga en el club o por transferencia" y la regla de cancelación, y el botón "Reservar".
- **`/reservas`**: próximas y pasadas, con estado de pago. "Cancelar" solo aparece dentro de plazo; si no, explica por qué. "Ya transferí" muestra los datos de la cuenta y permite subir el comprobante.
- **`/perfil`**: lado, mano, categoría ("validada" o "pendiente"), visibilidad y cerrar sesión.

### Club (`app/(club)/club`, pestañas; solo recepción y admin, controlado en el layout)

- **`grilla`**: tira de días; ocupación e ingresos del día; grilla de canchas × turnos. Una celda libre abre "Cargar" (reserva a jugador o a nombre, turno fijo, bloqueo). Una ocupada abre el detalle: titular, estado de pago, cobrar efectivo, cancelar o liberar. En vivo.
- **`calendario`**: vistas mes y semana; cada día muestra su ocupación y turnos fijos; al tocarlo abre ese día en la grilla.
- **`cobros`**: transferencias informadas para confirmar o rechazar, con el comprobante; reservas pasadas sin pagar.
- **`jugadores`**: lista con buscador; validar o corregir categoría; cambiar rol (solo admin).
- **`ajustes`** (solo admin): canchas, horario y duración de turno, precios por franja, ventana de reserva, aviso de cancelación, límite de reservas activas, medios de pago.

### Código compartido

- `lib/domain/slots.ts`: funciones puras que generan los turnos del día desde la configuración del club (en su zona horaria) y los cruzan con ocupaciones para armar la grilla.
- `lib/domain/errors.ts`: códigos de error → texto en español.
- Server Actions por ruta: validan la forma de la entrada, llaman a la RPC, traducen errores, `revalidatePath`.
- `components/`: grilla de turnos (una sola, con variante jugador y variante club), `DayStrip`, `Legend`, `PaymentBadge`.

## Flujo de datos y casos borde

- **Lectura**: Server Components con el cliente de servidor, así RLS aplica con la sesión. Grilla y Reservar traen el día completo de una vez (configuración, canchas, precios, ocupaciones, reservas propias).
- **Escritura**: si la RPC falla, el mensaje aparece en la hoja sin cerrarla; si sale bien, `revalidatePath` y toast.
- **Tiempo real**: grilla del club y Reservar se suscriben a `court_occupancy` filtrado por `club_id` (publicación de Realtime, con RLS). Ante un cambio recargan el día; no parchean estado a mano. Si el turno se ocupa con la hoja abierta, al confirmar llega `slot_taken` ("Esa cancha se acaba de ocupar") y la grilla se actualiza.
- **Zona horaria**: todo en `timestamptz`; los turnos se calculan en `clubs.timezone` (`America/Montevideo`) en la base y en `lib/domain` con `Intl`, sin librería extra. Tests con el último turno que termina a las 24:00.
- **Comprobantes**: se suben desde el navegador a `receipts/<user_id>/…` con política de Storage; la RPC verifica el prefijo; el staff los ve con URLs firmadas de corta duración.
- **Sin precio**: un turno sin regla de precio no se ofrece al jugador; en la grilla del club aparece "sin precio".
- **Cambios de configuración**: no tocan reservas existentes. Si una reserva queda fuera de la nueva grilla, se sigue mostrando, marcada.
- **Cancelar con pago confirmado**: la reserva se cancela; la devolución la hace recepción a mano y la marca `refunded`.
- **Perfil incompleto**: se redirige a `/bienvenida` antes de reservar.
- **Datos reales de Rustic**: llegan por una migración de datos (club, canchas, turnos, precios, medios de pago) cuando el club los pase. Mientras, el seed local usa los valores del prototipo (3 canchas, 08:00–23:00, 90 min, $1.200 / $1.600 desde 18:30).

## Tests

- **pgTAP**: cada función y cada regla: turno fuera de grilla, pasado, fuera de ventana, límite de reservas activas, misma hora, doble reserva, precio por franja, aviso de cancelación, permisos por rol, series con choques, estados de pago, comprobante obligatorio, y Storage (un jugador no lee comprobantes ajenos). Slots relativos a `now()`.
- **Vitest**: generación de turnos (incluido 24:00), armado de grilla, traducción de errores, componentes (grilla, hoja de reserva, `PaymentBadge`).
- **Playwright** (Supabase local), tres flujos:
  1. Jugador: alta → reserva → la ve en "Mis reservas" → informa transferencia con comprobante.
  2. Recepción: ve la reserva en la grilla → confirma el pago → carga un bloqueo y un turno fijo → cancela.
  3. Jugador intenta cancelar fuera de plazo y ve el motivo.

## Entrega

Cortes chicos dentro de `feat/fase-1-reservas`, cada uno en verde:

1. Modelo y RPCs (con pgTAP).
2. Dominio de turnos (`lib/domain`).
3. Reservar y Mis reservas (incluye alta y perfil).
4. Grilla del club y cobros.
5. Turnos fijos y calendario.
6. Jugadores y ajustes.
7. Realtime.

La fase se cierra con el preview de Vercel probado por Rustic y el README actualizado. Tras el merge, `migrate.yml` aplica las migraciones. Antes del piloto con clientes reales: migración con los datos reales de Rustic y Vercel Pro.

## Fuera de alcance

Partidos abiertos, disponibilidad y canchas preferidas, estadísticas del jugador, notificaciones por WhatsApp o email (salvo el login), pasarela de pago, torneos y day use.

## Open questions

- Datos reales de Rustic: canchas (nombre, techada o no), horario (¿cambia por día?), duración de turno, precios por franja, aviso de cancelación, datos de transferencia.
- ¿`max_active_bookings = 2` es el número correcto para Rustic?
- ¿Un PR al final o un PR por corte?
