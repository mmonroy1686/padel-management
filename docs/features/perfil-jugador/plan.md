---
feature: perfil-jugador
type: plan
status: done
date: 2026-11-26
branch: feat/perfil-jugador
references: ./design.md
---

# perfil-jugador — implementation plan

## Build sequence

| # | step | output | testable how |
|---|---|---|---|
| 1 | Base | Migración 1: tabla `player_contacts` con RLS (propio + staff de su club) y la RPC `save_player_contact(p_phone, p_consent)`. Migración 2: en `profiles`, `avatar_url` y `avatar_source` (enum `avatar_source`), solo escribibles por RPC (ver nota); RPCs `set_profile_avatar(p_path)`, `clear_profile_avatar()` y `sync_google_avatar()`; bucket `avatars` con sus políticas. Tipos regenerados | pgTAP `player_contacts.test.sql`, `profile_avatar.test.sql` |
| 2 | Dominio | `lib/domain/contact.ts`: `initialsOf`, `playerWhatsappUrl` (local a internacional con el país del club), `parseContactForm`. `lib/storage/avatar.ts` para subir a `<uid>/avatar-<ts>.<ext>` | Vitest |
| 3 | Perfil | Componentes `Avatar`, `AvatarForm` (se sube al elegir) y `ContactForm` (se guarda solo). Acciones `saveContact`, `saveAvatar`, `removeAvatar`. Perfil: foto arriba, «Ingresás con: email», sección WhatsApp. Alta: teléfono y consentimiento opcionales | Vitest de componentes y acciones |
| 4 | Google | `/auth/callback`: después del intercambio, `sync_google_avatar()` (copia la foto de los metadatos de la cuenta si `avatar_source` es null) | Vitest de la ruta |
| 5 | Panel | Jugadores: foto o iniciales en cada fila; la hoja «Editar» con email, WhatsApp y el botón «WhatsApp» solo con consentimiento. `loadMembers` suma el contacto (RLS) y el email (RPC de staff `club_member_emails`, o el que ya exista). Asistente: «WhatsApp a X» al número del candidato si aceptó | Vitest; pgTAP si hay RPC nueva |
| 6 | Encabezado | La foto del jugador en el encabezado de la app, como link a Perfil | Vitest |
| 7 | e2e y docs | `player-contact.spec.ts`: la jugadora carga el WhatsApp, acepta y sube una foto; el admin la ve en Jugadores con el botón a `wa.me/598…`. notes.md | Playwright |

Nota: `profiles` hoy tiene `grant update` a nivel de tabla. Pasa a permisos por columna (`display_name`, `side`, `hand`, `is_public`, `gender`, `show_in_club`), así la foto solo cambia por las RPC y nadie pone una URL cualquiera.

## Acceptance criteria

- [x] El teléfono y el consentimiento solo los leen el propio jugador y el staff de un club donde es miembro.
- [x] No se puede aceptar sin teléfono; la fecha del consentimiento se guarda y se borra al retirarlo.
- [x] El panel ofrece el chat de WhatsApp solo con consentimiento.
- [x] La foto se ve con esta prioridad: subida, después Google, después iniciales. Quitarla no hace volver la de Google.
- [x] El email se ve en Perfil, y en la hoja de Jugadores para el staff.
- [x] Pasan pgTAP, Vitest, Playwright y el build.

## Plan revisions

(append-only)

- **v1 (2026-11-26)**: initial plan.
- **v2 (2026-11-26)**: el email del staff sale de la RPC nueva `club_member_contacts`; el WhatsApp del Asistente usa la misma.
