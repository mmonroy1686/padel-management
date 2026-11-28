---
feature: avisos-de-reservas
type: design
status: approved
date: 2026-11-28
branch: feat/avisos-de-reservas
---

# avisos-de-reservas — design

## Propósito

Que cada jugador se entere por mail (y en la campana de Avisos) de todo lo que pasa con sus reservas y partidos:
que reservó, que falta poco, que pagó su parte, que se canceló. Hoy solo avisamos la lista de espera, los torneos, una
invitación a partido y que alguien se sumó a tu turno.

## Decisiones (con Miguel)

| Tema | Decisión |
|---|---|
| Eventos | Reserva confirmada, recordatorio, pagos (pagaste tu parte, transferencia rechazada, devolución) y cambios (cancelación, te sacaron del turno, alguien se bajó del partido) |
| Partidos abiertos | Igual que un turno, más «tu partido se completó» y «se canceló el partido» |
| Recordatorio | Lo elige el club en Ajustes → Reservas; por defecto 24 h antes; uno por turno |
| Destinatarios | Todos los que tienen cuenta en el turno (titular y los que se sumaron); cada uno recibe lo suyo |
| Quien hace la acción | También recibe el aviso, como comprobante («Reservaste…») |
| Apagar | El jugador puede apagar solo los recordatorios (Perfil); lo demás llega siempre |
| Campana | Todo queda también en Avisos: un solo sistema, el de `notifications` |
| Dónde se generan | Triggers en la base (enfoque A): cubren todos los caminos (jugador, recepción, partido que se completa, cron) |
| Turno fijo | Un aviso al crear la serie; cada semana solo el recordatorio |
| Cambio de cancha u horario | No existe en la app (recepción cancela y vuelve a cargar): llega como cancelación + reserva nueva |

## Principios

- **La base escribe el aviso, Next lo muestra y lo manda.** Es el patrón de `notifications` (lista de espera,
  campeonatos, `booking_join`): el trigger inserta la fila y `flushOutbox` la manda por mail después de cada acción y
  cada minuto desde el cron externo.
- **Un trigger por tabla, no por función.** `bookings`, `booking_players`, `recurring_series`, `open_matches`,
  `match_slots` y `payments`. Una función nueva que toque esas tablas avisa sola.
- **Quien actúa sale de `auth.uid()`.** Si es el destinatario: «Reservaste…». Si es staff que no juega: «El club…».
  Si es otro jugador: su nombre. Sin usuario (cron): el motivo («no se completó a tiempo»).
- **Sin ruido.** Un aviso por persona por evento; los invitados sin cuenta no reciben nada; las direcciones `.test`
  (datos demo) nunca se mandan.

## Eventos

Destinatarios = los participantes con cuenta: en un turno, el titular (`bookings.player_id`) y `booking_players` con
`player_id`; en un partido, `match_slots` con `player_id`.

| Aviso (`notification_kind`) | Cuándo (trigger) | A quién | Texto (título) |
|---|---|---|---|
| `booking_confirmed` | Insert en `bookings` confirmado, sin partido ni serie | Titular | «Reservaste la Cancha 2» / «El club te reservó la Cancha 2» |
| `booking_confirmed` | Insert en `booking_players` con `player_id` | Ese jugador | «Te sumaste al turno» / «Ana te sumó a su turno» |
| `booking_series` | Insert en `recurring_series` con `player_id` | Titular | «Tenés turno fijo los miércoles a las 20:00» |
| `booking_reminder` | pg_cron cada 10 min: faltan ≤ `clubs.reminder_hours` | Participantes con recordatorios prendidos | «Mañana jugás a las 20:00» / «Hoy jugás a las 20:00» |
| `booking_cancelled` | `bookings.status` pasa a `cancelled`, sin partido | Participantes | «Cancelaste tu turno» / «El club canceló tu turno» / «Ana canceló el turno» |
| `booking_removed` | Delete en `booking_players` con `player_id` (y no fue él) | Ese jugador | «Te sacaron del turno del miércoles» |
| `match_confirmed` | `open_matches.status` forming → confirmed | Los 4 | «Tu partido se completó: Cancha 2» |
| `match_cancelled` | `open_matches.status` → cancelled | Anotados | «Se canceló el partido» + motivo |
| `match_left` | Delete en `match_slots` con `player_id` (partido no cancelado) | Los que quedan | «Bruno se bajó del partido. Falta 1» |
| `payment_confirmed` | Pago de una reserva que queda `confirmed` (efectivo/POS al cobrar, transferencia al confirmarla) | Quien pagó | «Pagaste tu parte: $400» / «Pagaste el turno: $1.600» |
| `payment_rejected` | Pago de una reserva → `rejected` | Quien la informó | «Rechazaron tu transferencia» + motivo |
| `payment_refunded` | Pago de una reserva → `refunded` | Quien pagó | «Te devolvimos $400» |

Quién pagó: `payer_id` (partidos); si no, el jugador de `payer_position` (titular = 1, `booking_players` 2 a 4); si no
hay posición, el titular. Un pago de un invitado sin cuenta no avisa a nadie. Anular un cobro (`voided`) no avisa: es
una corrección de recepción.

Una reserva cargada después de empezar (recepción anota un turno ya jugado, los datos demo) no avisa: no es novedad.

Los avisos de un partido no repiten el de la reserva: `booking_confirmed` y `booking_cancelled` saltean las reservas
con `match_id` (ya avisan `match_confirmed` y `match_cancelled`). El recordatorio y los pagos sí valen para ambos.

## Recordatorio

- `clubs.reminder_hours smallint` (default 24, `null` = sin recordatorio). Ajustes → Reservas: «Recordatorio por mail»
  con 2, 3, 6, 12, 24 y 48 h antes, o «No mandar».
- `bookings.reminded_at timestamptz`: se marca al avisar; nunca dos veces.
- Solo turnos confirmados que **se reservaron antes de que abra la ventana** (`created_at < starts_at − reminder_hours`):
  quien reserva 2 h antes no necesita que le recuerden.
- `profiles.booking_reminders boolean default true`. Perfil: «Recordatorios de turnos por mail».
- `private.send_booking_reminders()` con pg_cron `*/10 * * * *`.

## Datos del aviso

`data` lleva lo que el texto necesita y nada más: `starts_at`, `court_name`, `actor` (`self` | `club` | `player`),
`actor_name`, `amount`, `method`, `reason`, `free` (lugares que faltan), `share` (precio por persona), `hours`.
`link`: `/turno/<booking_id>` para turnos, `/partidos/<match_id>` para partidos, `/perfil/partidos` no aplica.

En TS, `lib/domain/booking-notifications.ts` lee y redacta los 11 avisos (como `booking-join-notifications.ts`), y
`notifications.ts` los suma a `notificationContent`/`isNotificationStale`. Vencido (no se manda el mail): el
recordatorio y la confirmación cuando el turno ya empezó; los de pago y cancelación nunca.

## Fuera de alcance

- Mails de pagos de torneos, campeonatos y day use (no son reservas).
- Mover una reserva de cancha u horario.
- WhatsApp o push.

## Riesgos

- **Volumen**: un club con 30 turnos por día manda ~120 recordatorios. Resend aguanta; el cron externo manda 20 por
  corrida y por minuto (`BATCH`). Si crece, subir el lote.
- **Demo en prod**: `demo-data --prod` crea cientos de reservas; los mails a `@demo.*.test` se saltean.
- **Deploy antes que migrate**: el código nuevo tiene que tolerar que los `kind` nuevos todavía no existan (no los
  escribe la app, solo los lee: sin filas, no hay nada que leer).

## Manual

Actualizar Perfil (recordatorios), Avisos (qué llega), Ajustes → Reservas (recordatorio) y una sección «Avisos por
mail» con la lista de eventos.
