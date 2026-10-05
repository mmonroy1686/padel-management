---
feature: lista-de-espera
type: design
status: approved
date: 2026-10-05
branch: feat/lista-de-espera
references: ../fase-1-reservas/design.md, ../fase-2-partidos/design.md, ../fase-3b-day-use/design.md
---

# lista-de-espera — design

## Purpose

Cuando un turno se libera, hoy nadie se entera y se pierde la venta. La lista de espera deja que un jugador diga "avisame si se libera el sábado entre 18 y 21", retiene el turno para el primero de la lista apenas se libera y le avisa en la app y por mail; si no lo toma, pasa al siguiente. Es el paso 1 del spec "Campeonatos, lista de espera y ofertas de último momento" (Miguel, 4 de octubre de 2026): la reutilizan después los campeonatos (cupos por categoría) y las ofertas de último momento.

## Principles

- **Reglas en Postgres estándar**: tablas, triggers y funciones en SQL plano; escrituras solo por RPCs `security definer` con `search_path = ''` y `private.fail(code)`, como en las fases anteriores. `pg_cron` para lo que vence. Sin `pg_net` ni otras piezas exclusivas de Supabase: la idea es poder mover la base a un Postgres propio en Docker.
- **La base no llama a nadie**: los avisos se escriben en una *outbox* (`notifications`) y Next los envía.
- **El *exclusion constraint* tiene la última palabra**: una retención es una ocupación más, así que nadie puede reservar un turno retenido.
- **Prototipo**: la arquitectura se revisa después de validar con Rustic. Club único (`rustic`).

## Decisiones (brainstorm)

| Tema | Decisión |
| --- | --- |
| Alcance | Solo turnos de cancha. Cupos de day use y de categorías de torneo se suman en sus subproyectos, sobre el mismo motor. |
| Canal del aviso | En la app (campana, /avisos, banner en Inicio) y mail con Resend. Push y Telegram quedan para después. |
| Remitente | Un dominio de Miguel verificado en Resend, que sirve para todos los clubes. Variables `RESEND_API_KEY` y `EMAIL_FROM`; sin ellas el mail no sale y la espera funciona igual con el aviso en la app. |
| Envío | Ruta de Next `/api/avisos/enviar` con secreto (`NOTIFY_SECRET`). Se llama con `after()` desde las acciones que liberan un turno, y cada minuto desde un cron externo (cron-job.org; en un VPS, el cron del sistema). |
| Mail intercambiable | `sendEmail` detrás de una interfaz; Resend es la primera implementación. |
| Aviso sin recargar | Realtime sobre `notifications`, como la grilla y el day use. Se reemplaza junto con el resto si se migra. |
| Orden | El primero que se anotó. |
| Retención | 15 minutos; 5 si faltan menos de 2 horas para el turno; con menos de 45 minutos no se retiene: se avisa a toda la lista y gana el primero que reserva por el camino normal. |
| Tope | 3 esperas activas por jugador. Vencen solas cuando pasa su horario. |
| Pago | La reserva que sale de una retención es una reserva más: mismo precio, efectivo o transferencia con comprobante, aparece en Cobros. |

## Modelo de datos

- **`occupancy_kind`** suma `hold`. **`court_occupancy`** suma `expires_at timestamptz` (obligatorio si `kind = 'hold'`, nulo si no).
- **`slot_waits`**: `club_id`, `player_id`, `on_date`, `from_time`, `to_time`, `court_ids uuid[]` (vacío = cualquier cancha), `status` (`waiting`, `booked`, `expired`, `cancelled`), `created_at`. Índice por club y fecha para buscar quién espera.
- **`slot_holds`**: `club_id`, `wait_id`, `occupancy_id` (único, `on delete set null`), `court_id`, `period`, `expires_at`, `status` (`active`, `claimed`, `declined`, `expired`, `released`), `booking_id` cuando se reclama. Historial de cada retención y base del panel de demanda.
- **`notifications`**: `club_id`, `user_id`, `kind` (`slot_held`, `slot_free_now`), `data jsonb` (cancha, horario, vence el), `link`, `created_at`, `read_at`, `email_status` (`pending`, `sent`, `failed`, `skipped`), `email_attempts`, `emailed_at`. La reutilizan los campeonatos y las ofertas.
- RLS: cada jugador ve sus esperas, sus retenciones y sus avisos; el staff del club ve todas las esperas y retenciones del club. Nadie escribe directo.

## Cómo se mueve

1. **Se libera un turno** (reserva cancelada, bloqueo levantado, partido que se cae, retención rechazada o vencida). Un trigger `after delete` en `court_occupancy` (y el cambio de estado que libera la ocupación, según cómo cancela cada flujo) llama a `private.offer_freed(court_id, period)`.
2. `private.offer_freed` recorre los turnos de la grilla del club (`private.slot_period`) que caen en el período liberado, siguen libres y son futuros. Para cada uno:
   - más de 45 minutos para el turno: toma la primera espera `waiting` (por `created_at`) cuya fecha, rango y canchas aceptan ese turno y cuyo jugador no tenga otra retención activa; crea la ocupación `hold` con `expires_at` (15 o 5 minutos), la fila en `slot_holds` y el aviso `slot_held`;
   - menos de 45 minutos: crea un aviso `slot_free_now` para cada jugador que espera ese turno, sin retener.
3. **Reservar** (`claim_slot_hold(hold_id)`): solo el dueño y antes de `expires_at`. En una transacción borra la ocupación `hold`, crea la reserva con el precio del turno (las mismas reglas que una reserva online) y marca la retención `claimed` y la espera `booked`.
4. **No me sirve** (`decline_slot_hold(hold_id)`): marca `declined` y libera; el trigger pasa el turno al siguiente. La espera sigue `waiting` para otros turnos de su rango.
5. **Pasar al siguiente** (`release_slot_hold(hold_id)`, solo staff): igual que rechazar, con estado `released`.
6. **`pg_cron` cada minuto**: retenciones vencidas → `expired` y se libera la ocupación (el trigger avisa al siguiente); esperas cuyo horario ya pasó → `expired`.
7. **Anotarse** (`create_slot_wait`): valida fecha futura, rango dentro del horario del club, canchas del club y el tope de 3 activas. Si ya hay un turno libre en ese rango, lo dice en vez de anotar ("Hay un turno libre, reservalo"). **Cancelar** (`cancel_slot_wait`): el dueño; si tenía una retención activa, se libera.

## Envío de avisos

- `/api/avisos/enviar` (POST, header con `NOTIFY_SECRET`): toma los avisos con `email_status = 'pending'` (con `for update skip locked`, para que dos llamadas no manden el mismo), arma el mail y llama a `sendEmail`. Marca `sent`, o `failed` con un intento más (reintenta hasta 3 veces). Sin `RESEND_API_KEY`, marca `skipped`.
- El mail del jugador sale de `auth.users`, leído desde una función de la base que solo ve el envío.
- Mails en castellano rioplatense, con el logo y los colores del club:
  - `slot_held`: asunto "Se liberó tu turno: sáb 3, 19:00, Cancha 2"; dice hasta qué hora está retenido y lleva al banner.
  - `slot_free_now`: "Se liberó la Cancha 2 a las 19:00: el primero que reserva se la queda", con el link a /reservar en ese día.

## Pantallas

**Jugador**

- **/reservar**: botón "Avisame si se libera" debajo de la grilla, que abre una ventana con el día elegido, desde y hasta (turnos de la grilla) y canchas (todas marcadas). Tocar una celda "Ocupada" ofrece lo mismo, ya completado con ese horario. Con 3 esperas activas, la ventana lo dice y ofrece cancelar una.
- **Inicio**: card "Esperando turno" debajo de "Tus reservas", con cada espera ("sáb 3, de 18:00 a 21:00, cualquier cancha") y "Cancelar". Banner arriba de todo mientras hay una retención activa: "Se liberó la Cancha 2, sáb 3 a las 19:00. Te la guardamos 12:34", con cuenta regresiva y los botones "Reservar" (muestra el precio y confirma) y "No me sirve".
- **Encabezado**: campana con la cantidad de avisos sin leer, que lleva a **/avisos** (lista de avisos; abrirla los marca como leídos).

**Recepción y admin**

- **Grilla**: el turno retenido con borde ámbar punteado, "Retenido, lista de espera, hasta 19:42". El detalle muestra para quién es y un botón "Pasar al siguiente".
- **Panel "En espera"** al costado de la grilla, como "Partidos armándose": quién espera ese día y en qué rango. Es la demanda que no se pudo atender.

## Tests

- **pgTAP**:
  - nadie, ni el jugador ni recepción, reserva un turno retenido;
  - al liberarse un turno, la retención va al primero de la lista que acepta ese horario y esa cancha, y no a quien ya tiene otra activa;
  - la retención dura 15 o 5 minutos según cuánto falta, y con menos de 45 minutos se avisa a toda la lista;
  - una retención vencida pasa al siguiente cuando corre la tarea;
  - reclamar crea la reserva con su precio y su pago, y solo lo puede hacer el dueño antes del vencimiento;
  - tope de 3 esperas activas;
  - RLS de esperas, retenciones y avisos.
- **Vitest**: textos y cuenta regresiva del aviso, ventana para anotarse, banner, campana. La ruta de envío: manda los pendientes, marca los enviados, saltea sin `RESEND_API_KEY` y rechaza sin el secreto (Resend simulado).
- **Playwright**: un jugador se anota; recepción cancela la reserva de ese horario; el jugador ve el banner, reserva y queda con la reserva pendiente de pago.

## Fuera de alcance

- Esperas de cupos de day use y de categorías de torneo (subproyectos siguientes).
- Push y Telegram; preferencias de canal y horario de silencio (llegan con el servicio de avisos de los campeonatos).
- Alta desde un bot.
- Ofertas de último momento (paso 5 del spec).

## Open questions

- Dominio de Miguel para el remitente de Resend y sus registros DNS (lo configura Miguel; el código no depende de eso).
- Cuenta en cron-job.org (o similar) apuntando a `/api/avisos/enviar` en producción.
