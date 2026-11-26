---
feature: perfil-jugador
type: note
date: 2026-11-26
branch: feat/perfil-jugador
---

# perfil-jugador — notes

## Qué quedó

- **Base:**
  - `player_contacts` con `save_player_contact`: teléfono y consentimiento, que solo leen el jugador y el staff de su club.
  - En `profiles`: `avatar_source`, `avatar_path` y `avatar_url`, que solo se escriben por RPC (`set_profile_avatar`, `clear_profile_avatar`, `sync_google_avatar`). El permiso de `update` en `profiles` pasó a ser por columna.
  - Bucket `avatars`, con una carpeta por jugador.
  - `club_member_contacts`, solo para el staff: email, teléfono y consentimiento de cada miembro.
- **Perfil:** «Ingresás con email», la foto (se sube al elegirla; «Quitar foto» deja las iniciales) y la sección WhatsApp, que se guarda sola. En el alta, el WhatsApp y el consentimiento son opcionales.
- **Ingreso:** después del intercambio en `/auth/callback`, `sync_google_avatar` copia la foto de Google si el jugador nunca eligió. Si falla, el ingreso sigue igual.
- **Panel:**
  - Jugadores muestra la foto en cada fila. La hoja «Editar» muestra el email y el WhatsApp, y el botón al chat aparece solo con consentimiento.
  - En el Asistente, «WhatsApp a X» va al chat del candidato si aceptó.
- **Encabezado de la app del jugador:** la foto o las iniciales, como link a Perfil.

## Decisiones

- El teléfono es opcional, el consentimiento es uno solo por jugador y por ahora el uso es solo abrir el chat (Miguel, 26/11).
- La foto de Google se guarda como URL externa. Si Google la vence, `Avatar` cae a las iniciales (`onError`).
- El staff ve el teléfono aunque no haya consentimiento: es para llamar, por ejemplo. El botón de WhatsApp aparece solo con consentimiento.

## Producción

`migrate.yml` aplica tres migraciones nuevas al mergear:
- `20261202000100_player_contacts.sql`
- `20261202000110_profile_avatar.sql`
- `20261202000120_club_member_contacts.sql`

Crean una tabla, columnas nuevas, un bucket y funciones. Los datos que ya hay no cambian.

## Verificación

- pgTAP: `player_contacts` (11), `profile_avatar` (9), `club_member_contacts` (4), y `rls`, `championship_setup`, `match_suggestions` y `slot_candidates`, que actualizan `profiles`.
- Vitest: 1424.
- e2e: `player-contact.spec.ts`, `club-setup.spec.ts` (alta) y `player-booking.spec.ts`.
