---
type: handoff
date: 2026-11-24
status: ready
owner: Miguel
references: ./2026-11-23-validacion-y-multi-club.md, https://claude.ai/artifact/VtnATbz8CtakgVz4DRbeKQ (pestaña «Auditoría 24/11»)
---

# Handoff: hallazgos de la auditoría del 24/11 y salida al piloto

Leelo entero antes de tocar código. El handoff del 23/11 está terminado; este cierra lo que encontró la auditoría y deja la app lista para que un club de la ciudad la use con jugadores reales.
Las reglas del repo no cambian: README («Cómo trabajamos»), `AGENTS.md` y las de la sección «Reglas del repo» del handoff anterior. Cada corte sigue el flujo `design.md` → aprobación de Miguel → `plan.md` → implementación → `notes.md`. Para los cortes chicos (A, B y C) alcanza con un `notes.md` y un PR bien descrito.

## Orden de trabajo

| Corte | Qué | Hallazgo | Rama | Esfuerzo estimado (h) |
| --- | --- | --- | --- | --- |
| A | Columnas de `clubs` que puede editar un admin | 1 (alta) | `fix/clubs-columnas` | 2–3 |
| B | Cerrar Datos del club: foto verificada y proveedor de mapas configurable, después mergear | 4 y 5 | `feat/datos-del-club` (ya existe) | 2–3 |
| C | Orden del repo | 7 | `chore/handoffs` | 0,5 |
| D | Métricas del piloto | checklist | `feat/metricas-piloto` | 3–5 |
| E | Landing del producto en el dominio raíz | 2 | `feat/landing` | 15–20 |

A va primero y sola: es un hueco de seguridad y bloquea el piloto. B se rebasea sobre A antes de mergear porque las dos tocan `clubs`. E es lo único que puede esperar a después del arranque del piloto.

---

## Corte A: columnas de `clubs` que puede editar un admin

### Problema

`20260928000300_rls_policies.sql` da `grant update on public.clubs to authenticated` (toda la tabla) y la policy `clubs_update_admin` solo mira que sea admin del club. Un admin puede hacer `update clubs set ...` directo contra la API y cambiar cualquier columna de su club:

- `slug`: puede tomar un nombre reservado (`plataforma`, `api`, `admin`), usar `www` (lib/club/host.ts lo trata como "no es un club" y el club queda inaccesible) o mudar el club a otro subdominio y romper links, invitaciones y la PWA instalada. `private.checked_slug` solo corre en `create_club`.
- `timezone`: no tiene validación en la tabla. Una zona inválida rompe las funciones que hacen `at time zone` (reservas, turnos fijos, day use).
- `setup_completed_at`, `id`, `created_at`: no deberían tocarse nunca desde la app.

### Qué hay que construir

1. Migración nueva:
   - `revoke update on public.clubs from authenticated;`
   - `grant update (<columnas>) on public.clubs to authenticated;` con **solo** las columnas que hoy escribe la app como admin. Sacar la lista del código, no de memoria: los `supabase.from('clubs').update(...)` de `app/(club)/club/ajustes/actions.ts` y los parsers que usan (`lib/domain/settings.ts`, `lib/domain/loyalty.ts`, marca, logo, fondo del flyer, teléfono, nombre). Revisar también las funciones `security definer` que escriben en `clubs` (`save_club_info`, `finish_club_setup`, marca): esas no necesitan el grant, pero confirmá que ninguna dependa de él.
   - **Fuera del grant:** `id`, `slug`, `timezone`, `setup_completed_at`, `created_at`.
   - Check de zona horaria válida en `clubs.timezone`. Un `check` no puede consultar `pg_timezone_names`: usar un trigger `before insert or update of timezone` o una función `immutable` que pruebe `now() at time zone` dentro de un bloque con excepción. Decidilo en el diseño corto y anotá por qué.
2. Si Miguel quiere poder cambiar el slug de un club alguna vez, va por una RPC del super-admin que use `private.checked_slug` (`rename_club`, solo `private.is_platform_admin()`). Preguntale antes de construirla; no es obligatoria para este corte.
3. pgTAP (`supabase/tests/database/clubs_columns.test.sql` o ampliar `rls.test.sql`): un admin **no** puede cambiar `slug`, `timezone`, `setup_completed_at`, `id` ni `created_at` (`42501`); **sí** puede cambiar cada columna que edita Ajustes; recepción y jugadores no pueden cambiar nada; una zona inválida falla incluso para el super-admin o el service role.
4. README, «Cómo trabajamos»: agregar que una columna nueva de `clubs` editable por el admin necesita su `grant update (columna)` en la misma migración. Sin eso, Ajustes falla con permiso denegado.

### Criterios de aceptación

- Todos los e2e de Ajustes, alta guiada, marca, flyer y POS siguen pasando.
- Los pgTAP del punto 3 pasan.
- `update public.clubs set slug = 'plataforma'` como admin del club falla.

---

## Corte B: cerrar Datos del club y mergear

Trabajar en `feat/datos-del-club`, rebaseada sobre `main` después del corte A. Si Datos del club agrega columnas a `clubs` que edita el admin directo por la tabla, sumarlas al grant del corte A. Hoy las escribe `save_club_info` (`security definer`), así que no deberían hacer falta.

1. **Foto verificada (hallazgo 5):** `add_club_photo` acepta cualquier `p_path` con la forma correcta aunque el archivo no exista. Verificar que el objeto exista en `storage.objects` (bucket `club-logos`, ese `name`) como ya hacen los comprobantes en `20260929000700_payments.sql`. Error estable si no está (por ejemplo `photo_missing`, en los dos lados). Test pgTAP.
2. **Proveedor de mapas configurable (hallazgo 4):** `components/club-info/club-map.tsx` usa `https://tile.openstreetmap.org/{z}/{x}/{y}.png` fijo. Los servidores públicos de OpenStreetMap no están pensados para apps comerciales con tráfico. Pasar la URL de tiles y la atribución a variables de entorno (`NEXT_PUBLIC_MAP_TILES_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION`), con OpenStreetMap como valor por defecto para desarrollo y el piloto. Documentar en el README que antes de sumar clubes hay que poner un proveedor con clave. No elegir ni crear cuentas: eso lo decide Miguel. Revisar que el `location-picker` use la misma configuración.
3. Mergear el PR con CI en verde.

### Criterios de aceptación

- Agregar una foto cuyo archivo no se subió falla con un mensaje claro y no deja fila en `club_photos`.
- Sin las variables nuevas, el mapa se ve igual que hoy; con ellas, usa el proveedor configurado y muestra su atribución.

---

## Corte C: orden del repo

- Commitear `docs/handoff/` (este archivo y el del 23/11) y `CLAUDE.md` si Miguel lo quiere versionado. Hoy los dos están sin seguimiento.
- `supabase/config.toml` sigue modificado sin commitear desde el 23/11. **Preguntarle a Miguel** si va o se descarta; no decidirlo solo.
- Borrar las ramas locales ya mergeadas (`feat/alta-de-club`, `feat/cobro-pos`, `feat/sentry-prueba`, `fix/ci-e2e-campeonato`) solo si Miguel lo confirma.

---

## Corte D: métricas del piloto

El piloto tiene que dejar números para el caso de venta. No hace falta pantalla todavía: los reportes del dueño son la etapa 2 del roadmap.

1. `docs/piloto/metricas.sql` con consultas por club y por semana, en la zona horaria del club:
   - reservas por origen (`bookings.source`: `online` hecha por el jugador vs `reception`) y su porcentaje;
   - ocupación: horas ocupadas sobre horas disponibles por cancha y franja (mañana, tarde, noche), a partir de `court_occupancy` y el horario del club;
   - cancelaciones y cancelaciones tardías (dentro de `cancellation_notice_hours`);
   - turnos recuperados por la lista de espera (retenciones reclamadas);
   - jugadores activos (con al menos una reserva, partido o inscripción en la semana) y jugadores nuevos;
   - cobros por medio (efectivo, transferencia, POS).
2. Probarlas contra el seed local con `npm run demo:data` y dejar en el mismo archivo un ejemplo del resultado esperado en comentarios.
3. README: cómo correrlas. Las consultas contra producción **las corre Miguel** desde el SQL Editor de Supabase; el agente no se conecta a producción.
4. **Faltazos:** hoy no existen en el modelo (`booking_status` es `confirmed` o `cancelled`). Proponerle a Miguel en el diseño un "No vino" que recepción marque sobre una reserva pasada (valor nuevo de enum en su propia migración o columna `no_show_at`, RPC de staff, botón en el detalle de la reserva y su consulta en `metricas.sql`, unas 3–4 h). Construirlo solo si lo aprueba.

### Criterios de aceptación

- Cada consulta corre sin errores en el seed local, devuelve datos de un solo club cuando se le pasa su `club_id` y respeta la zona horaria del club.

---

## Corte E: landing del producto en el dominio raíz

### Problema

Con `NEXT_PUBLIC_ROOT_DOMAIN` cargado, el dominio raíz y `www` muestran el club de `DEFAULT_CLUB_SLUG` (Rustic). Para vender, ahí tiene que estar el producto.

### Qué hay que construir

1. **Ruteo:** cuando el host es exactamente el dominio raíz o `www.<dominio>`, mostrar la landing en lugar del club por defecto. En `localhost`, `*.vercel.app` y previews todo sigue como hoy (`DEFAULT_CLUB_SLUG`), así no se rompe el desarrollo ni los e2e. `/plataforma`, `/terminos` y `/privacidad` siguen funcionando en el dominio raíz. Ojo: `getViewer()` llama a `getClub()`; la landing no debe depender de un club.
2. **Contenido**, en español rioplatense y con el nombre de `NEXT_PUBLIC_PRODUCT_NAME` (ya existe en `lib/legal/documents.ts`). Seguí la propuesta de valor de la sección «Posicionamiento para captar clubes» del doc de evaluación:
   - titular: la app del club, con su marca y sin comisiones;
   - qué resuelve para recepción (grilla, turnos fijos, lista de espera, asistente y flyer), para el dueño (cobros del día por medio) y para el jugador (reservar y armar partidos);
   - campeonatos por categorías como gancho, con capturas reales del seed;
   - "Cómo empezar": alta del club en un día, sin comisión por reserva;
   - botón "Pedí una demo" que abre WhatsApp o email de Miguel (`NEXT_PUBLIC_SALES_WHATSAPP` y `NEXT_PUBLIC_SALES_EMAIL`). Sin formulario que guarde datos;
   - links a términos y privacidad.
   No publicar precios.
3. **Capturas:** generarlas con Playwright sobre el seed y guardarlas como assets estáticos. Sin datos de personas reales.
4. **SEO básico:** metadata, imagen OG del producto (no de un club), `robots` que indexe la landing y no `/plataforma`.
5. Diseño: usar la línea visual del repo (Barlow, tokens existentes) pero con identidad de producto, no la de Rustic. Antes de escribir código, presentarle a Miguel la estructura y el texto en el `design.md`.

### Criterios de aceptación

- e2e: con `NEXT_PUBLIC_ROOT_DOMAIN=example.test`, el host `example.test` muestra la landing; `rustic.example.test` muestra el club; `localhost:3000` sigue mostrando el club por defecto.
- Lighthouse en móvil con 90 o más en rendimiento y accesibilidad (anotar el resultado en `notes.md`).
- Ningún texto dice "Rustic" ni muestra la marca de un club.

---

## Fuera de alcance

- **Email de inicio de sesión con la marca de cada club (hallazgo 6):** Supabase Auth manda una sola plantilla para todos los clubes. Por ahora se acepta; Miguel nombra bien el remitente en el SMTP cuando haya nombre. No construir un envío propio del enlace mágico.
- Mercado Pago, WhatsApp, reportes con pantalla, ingreso por código, clases, abonos, rating, cantina y app en tiendas.

## Lo que hace Miguel fuera del repo

1. Elegir el nombre y el dominio. Cargar en Vercel `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_PRODUCT_NAME` y `PLATFORM_HOST`, y en Supabase las URLs de redirect, como dice el README.
2. SMTP propio con Resend en Supabase Auth y subir el límite de envíos.
3. Crear el proyecto en Sentry, cargar el DSN y probarlo desde Ajustes → Monitoreo.
4. Completar los 9 `[COMPLETAR]` de `lib/legal/documents.ts` (razón social, RUT, domicilio, departamento, email de contacto, fecha de vigencia, plazo de conservación, nombre del producto), pedir revisión legal y firmar un acuerdo simple con el club piloto (el texto dice que el club es responsable de los datos y vos el encargado). El agente reemplaza los textos cuando Miguel le pase los datos.
5. Crear el club piloto desde `/plataforma`, hacer el alta guiada con el dueño y cargar sus turnos fijos y jugadores en la primera semana.
6. Correr las consultas de `docs/piloto/metricas.sql` cada semana durante el piloto.

## Preguntas abiertas para Miguel (preguntar, no suponer)

1. ¿El cambio de `supabase/config.toml` va o se descarta?
2. ¿Hace falta poder cambiar el slug de un club desde la plataforma (`rename_club`)?
3. ¿Agregamos "No vino" para medir faltazos?
4. ¿WhatsApp, email o los dos para el botón "Pedí una demo" de la landing?

## Definición de terminado

- Cortes A a D en `main` con CI en verde antes de arrancar el piloto; E puede quedar para después.
- README actualizado: grant por columna en «Cómo trabajamos», variables nuevas (mapas, producto, contacto de ventas), cómo correr las métricas.
- Ningún admin de club puede cambiar el slug, la zona horaria ni el estado del alta de su club.

## Estado (25/11)

- **A:** mergeado (#43). `migrate.yml` no lo aplicó si corrió sin `--include-all`: lo agrega el PR de cierre de B.
- **B:** `feat/datos-del-club` ya estaba mergeado (#42); lo que faltaba (foto verificada, proveedor de mapas,
  `--include-all`) va en `fix/cierre-datos-del-club`.
- **C:** `config.toml` descartado (Supabase local en los puertos por defecto), ramas locales mergeadas borradas,
  handoffs versionados en `chore/handoffs`.
- **D:** diseño aprobado el 25/11 (franjas mañana < 14:00, tarde 14:00–19:00, noche ≥ 19:00; solo canchas activas;
  «No vino» incluido). En curso en `feat/metricas-piloto`.
- **E:** sin empezar. El botón «Pedí una demo» lleva a WhatsApp (principal) y email (secundario).
