---
feature: compartir-turno
type: design
status: approved
date: 2026-11-28
branch: feat/compartir-turno
---

# compartir-turno: diseño

## Para qué

Que un turno se complete solo cuando alguien se baja. Desde la reserva, el jugador manda el turno por WhatsApp; el
que lo recibe toca el link y se suma. Aprobado por Miguel el 28/11:

- **Sumarse:** el que recibe el link toca «Me sumo» y queda cargado.
- **Quién comparte:** cualquiera de los 4 del turno.

## Cómo funciona

- **El link** es `/turno/<id de la reserva>`. No hace falta un código aparte: el id no se adivina, y solo lo ve un
  miembro del club.
- **Página del turno:**
  - Para entrar, hay que estar en el club: el login y la bienvenida hacen el resto.
  - Muestra el día, la cancha, quién juega y los lugares libres.
  - El que está en el turno ve «Compartir por WhatsApp».
  - Si hay lugar, el que no está ve «Me sumo».
  - Un turno pasado o cancelado lo dice.
  - Un partido abierto redirige a `/partidos/<id>`, que ya tiene su propia forma de sumarse.
- **RPC:**
  - `booking_invite(booking)`: los datos del turno, solo para miembros del club. Para cualquier otro, `not_found`.
  - `join_booking(booking)`: la primera posición libre de 2 a 4, para un miembro del club, mientras el turno no
    empezó.
    - Bloquea la fila de la reserva, para que dos personas no tomen el mismo lugar.
    - Le manda al titular el aviso `booking_join`.
- **Inicio:** cada reserva futura (no partido abierto) tiene «Buscar jugadores», que abre WhatsApp con el mensaje
  armado.
- **Mensaje:** «🎾 Faltan 2 para jugar pádel», el día y la hora, el club y la cancha, y el link.

## Errores nuevos

- `already_in_booking`: «Ya estás en este turno.»
- `booking_full`: «El turno ya está completo.»

## Fuera de alcance

- Bajarse del turno desde el link: lo hace el titular o recepción.
- Compartir desde la grilla del club.

## Precio por persona (pedido de Miguel, 28/11)

La cancha siempre se divide entre los 4 jugadores, así que el jugador nunca ve el precio total.

- **Qué ve:**
  - En Reservar, la grilla y la hoja muestran «$400 c/u» o «$400 por persona».
  - La tarjeta de la reserva y la página del turno también muestran el precio por persona.
- **Cómo paga:**
  - Cada uno puede transferir su parte; la mayoría paga en el club.
  - `report_transfer`, en un turno común, registra la parte de la posición del jugador (`payer_position`). Es la
    misma regla con la que cobra recepción: precio ÷ 4, y lo que no da exacto lo paga el titular.
  - En los partidos abiertos no cambia nada.
- **Recepción:**
  - Sigue viendo el precio total.
  - En Cobros, la transferencia de una parte figura a nombre de quien la informó.
  - Confirmar la transferencia del titular ya no deja la reserva pagada: los otros 3 pagan la suya.
