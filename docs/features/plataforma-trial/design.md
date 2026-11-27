---
feature: plataforma-trial
type: design
status: approved
date: 2026-11-27
branch: feat/plataforma-trial
references: ../alta-de-club/design.md, ../metricas-piloto/design.md
---

# plataforma-trial: diseño

## Para qué

`/plataforma` hoy crea clubes y muestra una línea por club. Para vender, Miguel necesita llevar cada club por su
prueba y saber, sin correr SQL, si la prueba va bien: en qué estado está, cuánto le queda, qué hitos cumplió, cómo
evolucionan sus números semana a semana, y poder entrar a ayudar.

Aprobado por Miguel el 27/11: las cuatro piezas (ficha con métricas, estado del trial, checklist de activación,
acciones), trial de **60 días**, **nada automático** al vencer, pausar es **solo una etiqueta**, y soporte = **entrar
como admin con un toque**, registrado.

## Principios

- **Lo comercial no lo ve el club.** Estado, fin de la prueba, contacto del dueño y notas van en `club_accounts`, una
  tabla sin acceso por la API (como `platform_admins`). `clubs` la lee el club; esto no.
- **Todo por RPC** `security definer`, solo para el super-admin (`forbidden` para cualquier otro).
- **Las métricas salen de las mismas reglas que `docs/piloto/metricas.sql`**: semanas lunes a domingo en la zona del
  club, contadas por cuándo *empieza* lo que se cuenta.
- **Nada automático.** Un trial vencido solo se marca «Venció»; el club sigue andando. Pausado y Baja son etiquetas.
- **Soporte auditable.** Entrar como soporte deja una fila en `platform_support_sessions` (quién, cuándo, qué rol
  tenía antes) y el club te ve como «Soporte» en Staff.

## Datos

- Enum `club_account_status`: `trial`, `active`, `paused`, `churned` (Prueba, Activo, Pausado, Baja).
- `club_accounts (club_id pk → clubs on delete cascade, status default 'trial', trial_ends_at timestamptz,
  owner_name, owner_phone, owner_email, notes text, updated_at)`. RLS sin políticas y sin grants.
  - Un trigger `after insert on clubs` crea la fila con `trial_ends_at = now() + 60 días`.
  - La migración crea la fila de los clubes que ya existen, con la prueba arrancando hoy.
- `club_members.support_since timestamptz`: la membresía es de soporte.
- `platform_support_sessions (id, club_id, user_id, previous_role club_role null, started_at, ended_at)`. Sin
  acceso por la API.

## Funciones

| RPC | Qué hace |
| --- | --- |
| `platform_clubs()` | Se recrea con más columnas: estado y fin de la prueba, jugadores, reservas de 7 días (total y online), última reserva, si sos soporte, y los hitos (fecha de cada uno, o el número actual para los de masa crítica). Una sola llamada alimenta la lista y la ficha |
| `platform_club_weeks(p_club_id, p_weeks default 8)` | Una fila por semana: reservas online y de recepción, canceladas y tardías, horas abiertas y ocupadas, activos y nuevos, recuperados por la lista de espera, cobros y pesos, jugadas y faltazos |
| `platform_club_account(p_club_id)` | Contacto del dueño y notas |
| `set_club_account_status(p_club_id, p_status, p_trial_ends_on date)` | Cambia el estado y la fecha de fin (el día, en la zona del club, a las 23:59) |
| `save_club_account_contact(p_club_id, p_owner_name, p_owner_phone, p_owner_email, p_notes)` | Guarda contacto y notas (largos acotados; email con forma de email o vacío) |
| `join_club_as_support(p_club_id)` | Te hace admin del club con `support_since`. Si ya sos staff, `already_staff`. Abre la sesión con tu rol anterior |
| `leave_club_support(p_club_id)` | Vuelve al rol anterior (o borra la membresía si no tenías) y cierra la sesión |

- `club_staff` agrega `support boolean`. El staff de `platform_clubs` no cuenta las membresías de soporte.

## Hitos (checklist de activación)

En este orden, agrupados:

1. **Setup:** canchas y precios cargados · alta terminada · recepción entró (aceptó su invitación).
2. **Primeras reservas:** primera reserva de recepción · primera reserva online de un jugador.
3. **Masa crítica:** 20 jugadores en el club · 30% de las reservas de los últimos 7 días hechas online.
4. **Módulos:** primer cobro · primer partido abierto · primer torneo o campeonato · primer day use.

Cada hito muestra su fecha o, si falta, cuánto falta («12 de 20», «18% de 30%»). **Próximo paso** = el primer hito que
falta: es la columna que más dice en la lista.

## Pantallas

- **`/plataforma` (lista):** encabezado con los totales (clubes en prueba, activos, que vencen en 7 días). Una fila
  por club: nombre y link, estado con la prueba («Prueba · quedan 12 días», «Venció hace 3 días»), jugadores,
  reservas de 7 días con su % online, próximo paso y hitos cumplidos (7 de 11). Toda la fila abre la ficha.
  «Nuevo club» queda abajo, plegado.
- **`/plataforma/clubes/<slug>` (ficha):**
  - Arriba: nombre, link al club, estado, la prueba y acciones (cambiar estado y fecha, entrar o salir como soporte).
  - **Checklist** de hitos.
  - **Semanas:** esta semana contra la anterior en números grandes (reservas, % online, ocupación, activos, cobrado),
    y abajo la tabla de las 8 semanas.
  - **Contacto y notas** del dueño.
  - Cambiar dirección y reenviar invitación se mudan acá.
- Modo Operate: escaneo rápido, densidad, números tabulares, sin sombras, color del club solo en la acción principal.

## Errores nuevos

`already_staff` ya existe. Nuevos: `not_support` («No entraste a este club como soporte.»), `invalid_status`.

## Tests

- **pgTAP:** cada RPC nueva da `forbidden` a un admin de club; las tablas nuevas no se leen por la API; un club nuevo
  nace en prueba con 60 días; los hitos y las semanas contra datos armados; soporte entra, aparece en `club_staff`
  como soporte, no cuenta como staff y sale restaurando el rol.
- **Unit:** texto de la prueba, hitos y próximo paso, parsers de los formularios, resumen de semanas.
- **e2e:** el super-admin abre la ficha de Rustic, cambia el estado, guarda una nota y entra y sale como soporte.

## Fuera de alcance

- Cobrar o facturar, planes y precios.
- Avisos al club o bloqueos automáticos al vencer.
- Ver el panel de un club sin ser miembro.
