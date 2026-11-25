---
feature: clubs-columnas
type: note
date: 2026-11-24
branch: fix/clubs-columnas
references: ../../handoff/2026-11-24-auditoria.md (corte A)
---

# clubs-columnas: notas

Corte A de la auditoría del 24/11: el admin de un club podía cambiar cualquier columna de `clubs` desde la API, porque `20260928000300_rls_policies.sql` daba `grant update` sobre toda la tabla.

## Qué cambió

- Migración `20261127000200_clubs_columns.sql`:
  - Saca el `update` de toda la tabla y lo da solo sobre las 20 columnas que Ajustes escribe directo. La lista sale de `app/(club)/club/ajustes/actions.ts` y de sus parsers: reglas, pagos, nombre, WhatsApp, sellos, logo y fondo del flyer.
  - Quedan afuera del grant:
    - `id`, `slug`, `timezone`, `setup_completed_at` y `created_at`;
    - las columnas de marca (`brand_primary`, `brand_background`, `color_mode`), que ya se guardaban con `save_club_brand`.
  - Las funciones `security definer` que escriben en `clubs` no usan el grant: `save_club_brand`, `finish_club_setup`, `create_club` y, en la rama de Datos del club, `save_club_info`.
  - Agrega el trigger `clubs_timezone_known`: con una zona que no está en `pg_timezone_names`, falla con `invalid_timezone`, para cualquiera que escriba (también el service role y postgres).
  - Agrega `rename_club(p_club_id, p_slug)`, solo para el super-admin. Aplica las mismas reglas que un club nuevo (`private.checked_slug`). Si el nombre es el mismo que ya tiene, no cambia nada.
- /plataforma: cada club tiene «Cambiar dirección», que avisa que los links viejos dejan de andar. Aparece solo si hay dominio (`NEXT_PUBLIC_ROOT_DOMAIN`).
- README («Cómo trabajamos»): una columna nueva de `clubs` que edita el admin necesita su `grant update (columna)`.

## Decisiones

- **Trigger y no check para la zona horaria.** Un `check` solo puede llamar funciones `immutable`. `pg_timezone_names` lee la base de zonas horarias del servidor, que puede cambiar con una actualización. Una función marcada `immutable` que en realidad no lo es podría hacer fallar un restore si una zona deja de existir. El trigger solo juzga las escrituras nuevas, que es lo que necesitamos.
- **`rename_club`, aprobado por Miguel el 24/11.** Solo lo usa el super-admin. Una dirección sin cambios no da `slug_taken`: devuelve el club como está.
- **La marca queda fuera del grant**, aunque la escriba el admin, porque ya pasa por `save_club_brand`, que la valida y la normaliza.

## Verificación

- pgTAP `clubs_columns.test.sql` (23):
  - el grant tiene exactamente las columnas de Ajustes;
  - el admin no puede cambiar `slug`, `timezone`, `setup_completed_at`, `id`, `created_at` ni la marca (`42501`);
  - el admin sí guarda todas las columnas de Ajustes juntas;
  - recepción y los jugadores no cambian nada, y ningún admin toca otro club;
  - una zona inválida falla incluso para postgres;
  - `rename_club`: forbidden, reservado, en uso, mal formado, not_found y anon.
- La suite pgTAP completa pasa: 1362 tests.
