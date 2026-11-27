---
feature: plataforma-trial
type: note
date: 2026-11-27
branch: feat/plataforma-trial
---

# plataforma-trial: notas

## Qué quedó

- Migración `20261204000100_platform_trial.sql`:
  - `club_accounts` (estado, fin de la prueba, contacto, notas) con trigger que abre la prueba de 60 días al crear un
    club. Los clubes que ya existían arrancan su prueba el día que corre la migración.
  - `platform_clubs` recreada con jugadores, reservas online, si sos soporte y las fechas de cada hito.
  - `platform_club_weeks` lleva las consultas de `docs/piloto/metricas.sql` a la pantalla (una fila por semana,
    ocupación total en vez de por franja).
  - Soporte: `club_members.support_since`, `platform_support_sessions`, `join_club_as_support` y `leave_club_support`.
    `club_staff` devuelve `support`.
- `/plataforma`: una fila por club, ordenada por lo que necesita atención (pruebas que vencen primero). «Nuevo club»
  plegado abajo.
- `/plataforma/clubes/<slug>`: estado y fin de la prueba, soporte, hitos, la última semana contra la anterior, la
  tabla de 8 semanas, contacto y notas, dirección e invitación.
- Ajustes → Staff muestra «Soporte de la plataforma» sin botones de rol.

## Decisiones

- **`trial_ends_on` es una fecha, no un instante.** «Quedan N días» se cuenta en la zona del club y no depende de la
  hora a la que se guardó.
- **Hitos y no un puntaje.** Cada hito con su fecha dice qué pasó y cuándo; el primero que falta es el próximo paso.
- **«30% online» no tiene fecha:** es el estado de los últimos 7 días y puede ir y volver.
- **Recepción entró** toma la primera invitación de recepción aceptada o, para clubes cargados por SQL, la primera
  membresía de recepción.
- **Riesgo aceptado:** `club_members` tiene `grant update` de tabla para `authenticated`, así que el admin de un club
  podría escribir `support_since` por la API. Solo cambia la etiqueta en Staff y el conteo de staff de la plataforma;
  no da permisos.

## Producción

- La migración corre sola con `migrate.yml` después del CI verde de `main` (ver la memoria «deploy before migrate»).
  Si el CI falla, correr «Migrate production» a mano antes de abrir `/plataforma`: la página nueva llama a
  `platform_club_weeks`, que no existe hasta migrar.
- Rustic arranca en «Prueba» con 60 días desde el día de la migración. Cambialo desde su ficha si ya es «Activo».

## Verificación

- pgTAP `platform_trial` 27/27, `platform` y `staff_invitations` ok.
- Vitest 1469/1469 (dominio del trial nuevo), lint y build limpios.
- e2e `club-setup` extendido: fila del club, ficha, estado, notas, entrar y salir como soporte.
