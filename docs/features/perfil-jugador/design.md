---
feature: perfil-jugador
type: design
status: design
date: 2026-11-26
branch: feat/perfil-jugador
---

# perfil-jugador — design

## Purpose

El perfil del jugador suma lo que el club necesita para contactarlo y reconocerlo:
- su WhatsApp, con su consentimiento para recibir mensajes del club;
- el email con el que ingresa, visible;
- una foto: la de Google si entra con Google, una que suba, o sus iniciales.

En esta etapa el club usa el WhatsApp para **abrir el chat** con ese jugador desde el panel. Los mensajes automáticos por WhatsApp quedan para después, porque requieren la API de WhatsApp Business.

Decisiones de Miguel (26/11):
- el teléfono es **opcional**;
- el consentimiento es **uno solo por jugador**, no por club;
- el uso, por ahora, es abrir el chat desde el panel.

## Principles

- **El teléfono no es público.** Los perfiles públicos los ven todos los jugadores (`profiles_select`: `is_public`). El teléfono y el consentimiento van en una tabla aparte, `player_contacts`, que solo leen el propio jugador y el staff de un club donde es miembro (`private.is_staff_of_user`). Así no dependemos de permisos por columna sobre `profiles`.
- **Consentimiento explícito y registrado.** La casilla «Acepto que el club me escriba por WhatsApp» arranca sin marcar. Guardamos cuándo se aceptó (`whatsapp_consent_at`); al retirarlo, se borra la fecha. Sin consentimiento, el panel no ofrece el chat aunque haya teléfono (ley 18.331).
- **Una foto con prioridad clara:** la que subió el jugador, después la de Google, después sus iniciales. Si quita la foto, ve sus iniciales y no le volvemos a poner la de Google.
- **Reusar lo que hay:**
  - `normalizePhone` y el paso a número internacional de `whatsappUrl` (club-info);
  - el formulario que se guarda solo (`AutoSaveForm`);
  - la subida al elegir (como el logo).

## Datos

- **Tabla `player_contacts`:**
  - `user_id` (clave primaria, referencia a `profiles`, se borra con el perfil);
  - `phone` (texto, normalizado: dígitos, `0` local como `normalizePhone`, o null);
  - `whatsapp_consent` (booleano, por defecto falso);
  - `whatsapp_consent_at` (timestamptz o null);
  - `updated_at`.
- **RLS de `player_contacts`:** leer el propio y el de quien es miembro de un club donde soy staff; escribir solo el propio. La escritura va por RPC `save_player_contact(p_phone, p_consent)`, que normaliza el teléfono, pone o borra la fecha y no permite consentir sin teléfono.
- **En `profiles`:**
  - `avatar_url` (texto o null): una URL pública, sea del bucket o de Google;
  - `avatar_source` (`upload | google | none`, o null si nunca se decidió). Lo vemos donde ya se ve el nombre del jugador.
- **Bucket `avatars`:** público para leer; cada uno escribe solo en su carpeta `<user_id>/`. Acepta JPG, PNG y WebP de hasta 2 MB.
- **Foto de Google:** al volver del ingreso (`/auth/callback`), si `avatar_source` es null y la cuenta trae `avatar_url` o `picture` en los metadatos, se copia esa URL con `avatar_source = google`. No se pisa una foto subida ni una quitada a propósito.

## Pantallas

- **Perfil.** Arriba: la foto o las iniciales en un círculo, con «Cambiar foto» (se sube al elegirla) y «Quitar foto». Debajo del nombre, «Ingresás con: email@…» (solo lectura). Una sección nueva, **WhatsApp**, que se guarda sola:
  - el campo del teléfono («Tu WhatsApp», ejemplo 099 123 456);
  - la casilla de consentimiento con su explicación: «El club te puede escribir para invitarte a partidos y avisarte de tus reservas. Lo podés sacar cuando quieras.».
- **Alta del jugador** (completar perfil): el teléfono y el consentimiento aparecen como opcionales al final.
- **Panel → Jugadores.**
  - Cada fila muestra la foto o las iniciales.
  - La hoja «Editar» muestra el email y el WhatsApp. Si dio consentimiento, ofrece el botón «WhatsApp», que abre `wa.me/<internacional>`. Si no lo dio, dice «No aceptó mensajes por WhatsApp».
- **Asistente → invitar.** Si el candidato aceptó, «WhatsApp a X» abre el chat con él, con el texto de la invitación. Si no aceptó, queda como hoy: compartir el texto sin destinatario.
- **Foto en otros lugares:** el encabezado de la app del jugador (junto a la campana, lleva a Perfil) y las filas de Jugadores. La cancha dibujada sigue con nombres, sin fotos.

## Componentes

- `Avatar` (components/ui): círculo con la foto o las iniciales (hasta dos, de nombre y apellido) sobre `surface`, en tamaños sm, md y lg. `alt` vacío porque el nombre siempre está al lado.
- `AvatarForm` (components/profile): elegir, que se sube sola, y quitar; mismo patrón que `LogoForm`.
- `ContactForm` (components/profile): teléfono y consentimiento dentro de un `AutoSaveForm`.
- Dominio `lib/domain/contact.ts`: `initialsOf(name)`, `playerWhatsappUrl(phone, timezone, text)`, `parseContactForm`.

## Errores y bordes

- Un teléfono que no se puede normalizar da el error en el campo: «Revisá el número: por ejemplo 099 123 456».
- Si alguien marca el consentimiento sin teléfono, la RPC lo rechaza y el campo pide primero el número.
- Una foto muy pesada o en otro formato no se sube y se explica por qué. Si la URL de Google deja de andar, se muestran las iniciales (fallback `onError` en el `img`).
- El staff de otro club no ve el teléfono. Un jugador que no es del club no aparece en Jugadores.

## Tests

- **pgTAP:**
  - quién lee `player_contacts` (el propio jugador, el staff de su club, nadie más);
  - `save_player_contact` normaliza el teléfono, pone y borra la fecha, y rechaza consentir sin teléfono;
  - las políticas del bucket `avatars`.
- **Vitest:**
  - `initialsOf`, `playerWhatsappUrl` y `parseContactForm`;
  - `Avatar` (foto, iniciales, fallback);
  - `ContactForm` y `AvatarForm`;
  - la hoja de Jugadores, con y sin consentimiento;
  - la copia de la foto de Google en el callback.
- **e2e:** el jugador carga su WhatsApp, acepta y sube una foto; el admin la ve en Jugadores y el botón abre `wa.me/598…`.

## Open questions

Ninguna: Miguel respondió las tres (opcional, uno solo, abrir el chat).
