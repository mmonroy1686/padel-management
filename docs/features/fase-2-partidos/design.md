---
feature: fase-2-partidos
type: design
status: design
date: 2026-09-29
branch: feat/fase-2-partidos
references: ../../plan-general.md, ../../prototipo.html, ../fase-1-reservas/design.md
---

# fase-2-partidos — design

## Purpose

Que un jugador de Rustic arme un partido abierto, que otros se sumen en el lado que falta y que la cancha se reserve sola cuando están los cuatro. Es lo que hoy pasa en el grupo de WhatsApp ("falta 1 de revés para el jueves 20:00"), pero con reglas claras: categoría, tipo de partido, lado, cancelación automática y cobro por jugador. El link del partido se comparte en el grupo y lleva directo a sumarse.

Referencia de flujos y textos: [docs/prototipo.html](../../prototipo.html) (`viewPartidos`, `matchCard`, `canJoin`, `risk`, `complete`, `suggestions`, `forMe`, `shareText`, hojas `match`, `join`, `create`, `share`).

## Decisiones tomadas en el brainstorm (2026-09-29)

| Tema | Decisión |
| --- | --- |
| Alcance | Núcleo (armar, sumarse, salir, completar, cancelación automática, compartir con link) + "Partidos para vos" + sugerencias de jugadores. Invitar = abrir WhatsApp con el mensaje; sin notificaciones automáticas |
| Tipo de partido | Masculino, femenino o mixto. El perfil suma género (masculino / femenino); a un mixto se suma cualquiera |
| Cancha mientras se arma | No se ocupa. Al entrar el 4.º se reserva la preferida u otra libre (si el creador lo permitió); sin cancha, el partido se cae |
| Cobro | Cada jugador paga su parte (precio / 4, el resto al lugar 1) en el club o por transferencia |
| Bajarse de un partido completo | Con el aviso mínimo del club: el lugar se libera, el partido vuelve a buscar gente y conserva la reserva hasta la hora de cierre; si no se llena, se cancela y libera la cancha. Dentro del plazo, avisa al club |
| Arquitectura | Enfoque A: todo en funciones de Postgres, como la fase 1. Sugerencias en una función `security definer` que no expone datos crudos |
| Por defecto | Cierre de partidos incompletos 3 h antes (`clubs.match_close_hours`); sin "asistencia" en las sugerencias (no hay datos); historial calculado en la función, sin vista materializada |

## Principles

- **La base garantiza las reglas.** Crear, sumarse, salir, completar y cobrar son funciones de Postgres atómicas. El cuarto jugador y la reserva de la cancha ocurren en la misma transacción; la restricción de exclusión sigue evitando la doble reserva.
- **Un partido que se arma no bloquea turnos.** Solo ocupa cancha cuando está completo (o cuando alguien se bajó de uno completo, hasta la hora de cierre).
- **Privacidad por defecto.** La disponibilidad y las canchas preferidas son del jugador. Las sugerencias las usan del lado de la base y devuelven solo nombre, lado, categoría y motivos. Los permisos por columna y RLS aplican también en Realtime.
- **Lo que falta se dice en palabras** ("Falta 1 de revés") y toda regla que afecta al jugador (precio por persona, cierre, plazo para bajarse) se explica en el momento (plan general).

## Modelo de datos

### Perfil

- `profiles.gender` (`male` | `female`), obligatorio en la bienvenida. Quien ya tiene cuenta lo completa al entrar (la bienvenida vuelve a pedirlo).
- `player_availability`: `(user_id, weekday, band)`, con `band` = `morning` (antes de 13), `afternoon` (13 a 18), `night` (desde 18). Se edita en Perfil.
- `player_preferred_courts`: `(user_id, court_id)`.
- Ambas tablas: el jugador lee y escribe las suyas por RPC; nadie más las lee.

### Club

- `clubs.match_close_hours` (default 3): horas antes del turno en que se cierra un partido incompleto.

### Partidos

- **`open_matches`**: `club_id`, `period` (un turno de la grilla; `starts_at`/`ends_at` generadas), `preferred_court_id`, `allow_other_court`, `category_min`, `category_max`, `match_type` (`male` | `female` | `mixed`), `status` (`forming` | `confirmed` | `cancelled`), `cancel_reason`, `booking_id` (la reserva cuando se completó; se conserva si alguien se baja), `created_by`, `created_at`, `cancelled_at`.
- **`match_slots`**: `match_id`, `position` 1–4, `team` (A | B), `side` (`drive` | `backhand`), `player_id` (null = libre), `joined_at`. Un jugador ocupa un solo lugar por partido.
- Cualquier miembro del club lee los partidos y sus lugares (fecha, cancha, categoría, tipo, quiénes están).

### Reservas y pagos

- `bookings.match_id`: el titular es exactamente uno de `player_id`, `guest_name` o `match_id`. La ocupación es `kind = 'match'`.
- `payments.payer_id`: en un partido cada jugador paga su parte. Parte = precio / 4 con el resto en el lugar 1. Lo que debe cada uno = su parte − sus pagos confirmados. El partido está pagado cuando los cuatro cubrieron su parte.

## Operaciones en la base

Funciones `security definer`, `search_path = ''`, códigos de error estables como en la fase 1.

### Jugador

| Función | Reglas |
| --- | --- |
| `create_match(court_id, starts_at, allow_other_court, category_min, category_max, match_type, side)` | Turno en la grilla, a futuro, antes del cierre y dentro de la ventana; el creador cumple categoría (su categoría actual, validada o no) y tipo, y no tiene nada a esa hora. Crea los 4 lugares y ocupa uno de su lado en el equipo A. No ocupa cancha. Si la preferida ya está ocupada y no se permite otra: `slot_taken` |
| `join_match(match_id, slot_position)` | Lugar libre; partido `forming` y antes del cierre; cumple categoría, tipo y lado (quien juega ambos lados entra en cualquiera); nada a esa hora. Si es el 4.º: con reserva retenida pasa a `confirmed`; si no, reserva la preferida o, si se permite, la primera libre por orden y crea reserva y ocupación; sin cancha, cancela con "no quedaba cancha" y lo devuelve como resultado (no error). Bloquea la fila del partido: en una carrera entra uno solo |
| `leave_match(match_id)` | Armándose: cuando quiera; si no queda nadie, se cancela. Completo: solo con `cancellation_notice_hours` de aviso (`notice_period`); el lugar se libera y el partido vuelve a `forming` con la reserva |
| `match_suggestions(match_id)` | Solo participantes o staff. Hasta 6 miembros que entran en un lugar libre (categoría, tipo, lado, sin nada a esa hora, no anotados), con nombre, lado, categoría, motivos y puntaje |
| `save_my_profile(…, gender)`, `save_my_availability(bands)`, `save_my_preferred_courts(court_ids)` | Solo lo propio |
| `report_transfer(booking_id, receipt)` | Para un partido, informa la parte de quien llama; exige estar en el partido |

### Recepción y admin

- `cancel_match(match_id, reason)`: cancela el partido y su reserva si tiene.
- `remove_from_match(match_id, player_id)`: saca a un jugador sin plazo.
- `record_cash` y `confirm_payment` aceptan `payer_id` para las reservas de partidos.

### Automático

- `pg_cron` cada 10 minutos, `close_matches`: cancela los partidos `forming` que llegaron a la hora de cierre ("no se completó a tiempo"); si tenían reserva retenida, la cancela y libera la cancha.

### Errores nuevos

`category_mismatch`, `type_mismatch`, `side_mismatch`, `match_closed`, `already_in_match`.

## Pantallas

### Jugador

- **`/partidos`** (pestaña nueva): filtro "Donde puedo sumarme" / "Todos"; "Armar partido". Tarjeta: día, hora, cancha, categoría y tipo; "Falta 1 de revés"; dibujo de la cancha con los 4 lugares; estado (armándose, confirmado, cancelado); acción directa "Sumarme de revés" o el motivo de por qué no.
- **`/partidos/<id>`** (también el link para compartir): lo de la tarjeta más precio por persona ("$400 c/u, se paga en el club o por transferencia"); "¿Cómo funciona?"; "Sumarme" (tocar el lugar, confirmar; aviso "Sos el cuarto: al confirmar se reserva la cancha"); "Salir del partido" (con plazo); "Compartir en WhatsApp" (mensaje del prototipo con el link, copiar o abrir WhatsApp). "Invitá a quien le puede servir" (solo anotados): sugerencias con "Invitar por WhatsApp" (`wa.me` con el mensaje). Al completarse, el resultado ("Partido confirmado en la Cancha 2" o "Se canceló: no quedaba cancha").
- **Armar partido** (hoja): día, turno, cancha preferida, "si se ocupa, usar otra libre", rango de categoría (por defecto la propia ±1), tipo, lado propio.
- **Inicio**: "Partidos para vos" (hasta 2: horario habitual, disponibilidad, cancha preferida) y "Tu próximo partido" con confirmados y armándose.
- **Reservar**: una celda libre con un partido armándose muestra "Falta N" y lo abre; la hoja de reserva suma "Armar partido abierto, $400 c/u".
- **Mis reservas**: los partidos confirmados con la parte propia, su estado de pago y "Ya transferí".
- **Perfil**: género, "Cuándo solés poder jugar" (días × mañana/tarde/noche) y canchas preferidas.

### Club

- **Grilla**: celdas con "Partido abierto" y pago por jugador; celdas libres con "Armándose 3/4 · no bloquea"; detalle con cancelar partido y sacar jugador.
- **Panel "Partidos armándose"** al costado de la grilla, con el riesgo de cada uno.
- **Cobros**: transferencias y pendientes de partidos por jugador.
- **Ajustes**: "Horas antes para cerrar partidos incompletos".

### Código compartido

- `lib/domain/matches.ts`: `canJoin` y su motivo (mismas reglas que `join_match`), texto de lo que falta, riesgo de cancha, parte por persona, texto para compartir, orden de "Partidos para vos".
- `components/matches/*`: dibujo de la cancha, tarjeta, hoja de armar, hoja de sumarse.

## Flujo de datos y casos borde

- **Lectura** con la sesión del usuario; el motivo de cada tarjeta sale de `canJoin`, la base tiene la última palabra.
- **Tiempo real**: `open_matches` y `match_slots` en la publicación de Realtime (permisos por columna como la fase 1); lista, detalle y grilla se recargan ante un cambio.
- **Precio**: se calcula y congela al completarse, con la franja de ese turno. Antes se muestra el estimado.
- **La preferida se reserva mientras se arma**: aviso de riesgo en la tarjeta ("se asigna otra libre" / "no quedan canchas, el partido se cae").
- **Cambio de categoría después de sumarse**: sigue en el partido (las reglas valen al sumarse).
- **Recepción reserva encima de un partido armándose**: se permite; el partido muestra el riesgo.
- **Un confirmado pierde un jugador y no se llena antes del cierre**: se cancela y libera la cancha; lo ya pagado queda "a devolver" en Cobros.
- **Link abierto sin sesión**: ingreso → bienvenida si hace falta → vuelve a `/partidos/<id>`.
- **Límite de reservas activas**: los partidos no cuentan; sí cuenta no tener dos cosas a la misma hora.
- **Historial de sugerencias**: reservas propias y partidos confirmados ya jugados, mismo día de la semana y hora; calculado en `match_suggestions`.

## Tests

- **pgTAP**: `create_match` (grilla, tiempo, categoría, tipo, superposición); `join_match` (cada rechazo; el 4.º reserva la preferida; pasa a otra; sin cancha se cancela; carrera por el último lugar; reconfirmar con reserva retenida); `leave_match` (armándose, completo con y sin plazo, último jugador); `close_matches` (con y sin reserva retenida); `match_suggestions` (permisos; excluye anotados, ocupados, otra categoría o tipo; no expone disponibilidad); pagos por jugador (parte con resto, efectivo y transferencia por jugador); permisos por columna, Realtime y catálogo "`anon` no ejecuta nada".
- **Vitest**: `canJoin` y motivos, "Falta 1 de revés", texto de WhatsApp, "Partidos para vos", riesgo, parte por persona; componentes (cancha, tarjeta, hojas); perfil con género, disponibilidad y canchas preferidas.
- **Playwright**: (1) armar partido, sumar 3 (dos por API, el último por UI), confirmar y ver la cancha ocupada en la grilla; (2) abrir el link sin sesión, ingresar y sumarse; (3) un partido incompleto se cancela solo al cierre (llamando a `close_matches` con reloj simulado).

## Entrega

Cortes chicos en `feat/fase-2-partidos`, cada uno en verde:

1. Modelo y perfil (género, disponibilidad, canchas preferidas).
2. RPCs de partidos y cierre automático.
3. Pagos por jugador.
4. Dominio TS.
5. Pantallas de partidos.
6. Integración (Inicio, Reservar, Mis reservas, grilla, Cobros, Ajustes).
7. Sugerencias.
8. Realtime y e2e.

Las migraciones llegan a producción con el merge (`migrate.yml`). Antes de probar con jugadores reales: SMTP propio (sin él no llegan los enlaces de ingreso de quien abre el link compartido).

## Fuera de alcance

Notificaciones automáticas (WhatsApp o email), estadísticas y asistencia del perfil, partidos por parejas y torneos.

## Open questions

- ¿3 horas es la hora de cierre correcta para Rustic?
- ¿"Tipo" de partido es suficiente con masculino / femenino / mixto, o Rustic usa otra división?
