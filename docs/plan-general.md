# Rustic Pádel App: plan de diseño, acción y ejecución

Sep 28, 2026 · @Miguel

Documento fuente del producto. Cada fase tiene su carpeta en `docs/features/`.

## Resumen y decisiones clave

Convertimos el prototipo en una app real para Rustic Pádel: código en [github.com/mmonroy1686/padel-management](https://github.com/mmonroy1686/padel-management), web en Vercel y base de datos Postgres en Supabase, con la identidad ámbar y negro del club. El MVP cubre canchas, reservas, turnos fijos, partidos abiertos con sugerencias y perfil de jugador; torneos, day use y pagos online llegan en fases siguientes.

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Frontend | Next.js (App Router) + React + TypeScript + Tailwind, como PWA mobile-first | Vercel lo ejecuta de forma nativa y el prototipo ya está pensado en React |
| Backend | Supabase (Postgres, Auth, Realtime, Row Level Security) + Server Actions de Next.js | Vercel no ejecuta .NET; una API .NET exigiría otro hosting pago (Azure o similar) |
| Base de datos | Postgres en Supabase | Permite el *exclusion constraint* que hace imposible una doble reserva |
| Acceso de jugadores | Enlace mágico por email + Google en el MVP | Gratis; el código por WhatsApp o SMS tiene costo por mensaje y queda para la fase 2 |
| Pagos | Medios de pago configurables por club. Rustic: efectivo o transferencia, confirmados por recepción. Pasarela (Mercado Pago) opcional en la fase 4 | Rustic solo cobra por transferencia o en efectivo en el local; otros clubes pueden querer pasarela |
| Clubes | Multi-club desde el día 1 (`club_id` en cada tabla), arrancando solo con Rustic | Pasar a SaaS después no obliga a rehacer el modelo |
| Identidad | Paleta y logo de Rustic Pádel | Pedido explícito; los colores se tomaron de la imagen del torneo |

El stack cambia respecto del plan inicial (.NET + Azure) porque el objetivo ahora es Vercel + Supabase con costo cero o casi cero. Los tests y la calidad se mantienen: Vitest para lógica y componentes, Playwright para flujos completos y pgTAP para las reglas de la base de datos.

## Plan de diseño

La app hereda la estructura y los flujos del prototipo y cambia su piel a la de Rustic: fondo casi negro, ámbar como único color de acción y el azul de la cancha como secundario.

### Paleta

Colores medidos sobre la imagen del torneo. Contraste según WCAG; 4.5:1 es el mínimo para texto normal.

| Token | Hex | Origen en la imagen | Uso | Contraste |
| --- | --- | --- | --- | --- |
| `rustic-amber` | #FCB021 | Logo y banda de inscripción | Botones principales, "Falta 1", sellos del day use, lugar libre en la cancha | 10.0:1 sobre `night`; 1.85:1 sobre blanco, nunca como texto sobre fondo claro |
| `rustic-amber-ink` | #8A5A00 | Derivado del ámbar | Links y texto de acento en modo claro | 5.9:1 sobre blanco |
| `night` | #021716 | Fondo del afiche | Fondo del modo oscuro, barra superior, navegación | 18.5:1 con texto blanco |
| `black` | #000000 | Fondo del logo | Texto sobre ámbar | 11.4:1 sobre ámbar |
| `court-blue` | #025995 | Piso de la cancha | Reservas, grilla, dibujo de la cancha | 7.3:1 con texto blanco; 2.5:1 sobre `night`, en oscuro se usa `court-blue-light` para texto |
| `court-blue-light` | #4DA3DB | Derivado del azul | Texto y bordes azules en modo oscuro | 6.7:1 sobre `night` |
| `white` | #FFFFFF | Tipografía del afiche | Texto principal en oscuro, fondo en claro | 18.5:1 sobre `night` |

Los colores de estado (confirmado, riesgo, cancelado) y los de la grilla (torneo, bloqueo, day use) se derivan de esta base y se validan con la misma regla de contraste.

### Tipografía y marca

- **Logo:** archivo vectorial (SVG) del club, sin recrearlo. Placeholder hasta tenerlo.
- **Títulos y números:** Barlow Condensed 700.
- **Texto:** Barlow 400/500/600 (Google Fonts).

### Modo oscuro y claro

Oscuro por defecto (identidad del club, uso nocturno). Claro según preferencia del sistema. Colores como variables CSS y tokens de Tailwind.

### Pantallas

| Área | Pantallas | Estado en el prototipo |
| --- | --- | --- |
| Jugador | Inicio con accesos rápidos, Reservar, Partidos abiertos, Torneos, Day use, Perfil | Resueltas |
| Jugador | Ingreso (email o Google), alta de perfil con categoría y lado | Nueva |
| Club | Grilla del día, Calendario mes/semana, Torneos, Day use con recompensas | Resueltas |
| Club | Jugadores (validar categoría), Configuración del club (canchas, precios, horarios) | Nueva |
| Torneos | Torneo por parejas con categoría "suma" | Fuera del alcance por ahora |

### Reglas de UX que se mantienen

- Botones de al menos 44 px de alto y cierre visible (✕) en toda hoja emergente.
- Lo que falta en un partido se dice en palabras ("Falta 1 de revés"), no solo con el dibujo.
- Acción directa en las tarjetas: "Sumarme de revés" sin pasar por el detalle.
- Horarios pasados ocultos, filtro "Solo libres" y leyenda de colores en Reservar.
- Toda regla que afecta al jugador (cancelación, sellos, cobro) se explica en el momento en que la necesita.

## Arquitectura y modelo de datos

Sin servidor propio: Next.js en Vercel atiende pantallas y lógica; Supabase guarda datos, maneja acceso y empuja cambios en vivo. El navegador recibe Realtime directo desde Supabase.

### Tablas principales

| Tabla | Qué guarda | Regla clave |
| --- | --- | --- |
| `clubs` | Nombre, zona horaria (`America/Montevideo`), política de cancelación | Todo lo demás cuelga de `club_id` |
| `courts` | Canchas: nombre, tipo, si está activa |  |
| `pricing_rules` | Precio por franja, día y luz |  |
| `profiles` | Jugador: nombre, lado, mano, visibilidad | Uno por usuario de Auth |
| `club_members` | Rol (admin, recepción, jugador), categoría, si está validada | Base de todos los permisos |
| `court_occupancy` | Todo lo que ocupa una cancha: reserva, turno fijo, torneo, bloqueo, partido, day use | `EXCLUDE USING gist (court_id WITH =, period WITH &&)` sobre `tstzrange` |
| `recurring_series` | Turnos fijos semanales | Genera sus ocupaciones semana a semana |
| `open_matches`, `match_slots` | Partidos abiertos y cada lugar con su lado | La ocupación se crea en la misma transacción que suma al cuarto jugador |
| `tournaments`, `tournament_entries`, `tournament_games` | Americanos, inscriptos, partidos y puntajes | Bloquean canchas al crearse |
| `day_use_products`, `day_use_overrides` | Pases con días, horario, canchas y cupo; excepciones por fecha | Ocupaciones de day use se regeneran al guardar |
| `day_use_passes`, `day_use_visits`, `loyalty_rules` | Pases vendidos con QR, ingresos, recompensas | El sello se suma al registrar el ingreso |
| `player_stats` | Vista materializada | Se recalcula con `pg_cron` una vez por día |
| `club_payment_methods`, `payments` | Medios por club; cobros vinculados a reserva/lugar/inscripción/pase | Estados: pendiente, informado, confirmado, devuelto |

### Seguridad y tareas

- RLS en todas las tablas según `club_members.role`.
- Operaciones sensibles como funciones Postgres atómicas llamadas desde Server Actions.
- `pg_cron` cancela partidos incompletos y recalcula estadísticas.
- Esquema como migraciones SQL versionadas en `supabase/migrations`.

### Pagos

- Transferencia: jugador ve datos de cuenta, marca "ya transferí", sube comprobante a Supabase Storage (obligatorio en Rustic). Recepción confirma.
- Efectivo: recepción registra el cobro.
- La app no mueve dinero: registra quién pagó, cómo y quién confirmó.

## Plan de acción

| Fase | Duración estimada | Acumulado |
| --- | --- | --- |
| 0. Base | 2 semanas | 2 semanas |
| 1. MVP de reservas | 8 semanas | 10 semanas |
| 2. Partidos abiertos | 4 semanas | 14 semanas |
| 3. Torneos y day use | 8 semanas | 22 semanas |
| 4. Pagos y crecimiento | Sin fecha: depende del segundo club |  |

Ritmo: 2 a 3 horas por semana con Claude Code. Si una fase se atrasa, la siguiente se corre.

Cada fase termina con: tests en verde en CI (unitarios, DB, un flujo Playwright), deploy de preview probado por el club, funciones nuevas en el README.

## Plan de ejecución (fase 0)

1. **Repo.** `create-next-app` (TypeScript, Tailwind, App Router, ESLint), `main` protegida, todo por PR.
2. **Supabase.** Proyecto en São Paulo. CLI local con `supabase start` (Docker).
3. **Esquema.** Migraciones, `btree_gist`, tipos con `supabase gen types`.
4. **Seguridad.** RLS por tabla + tests pgTAP.
5. **Acceso.** Enlace mágico + Google; sesión en cookies.
6. **Diseño.** Tokens Rustic, logo, fuentes, componentes base.
7. **Pantallas.** Fase por fase siguiendo `docs/prototipo.html`.
8. **Tests y CI.** GitHub Actions: lint, typecheck, Vitest, pgTAP; Playwright contra preview.
9. **Vercel.** Importar repo, variables de entorno (clave de servicio solo servidor).
10. **Migraciones en producción.** `supabase db push` en CI al hacer merge.
11. **Resguardo.** `supabase db dump` semanal como artefacto privado.

### Estructura del repo

```text
padel-management/
  app/
    (jugador)/        inicio, reservar, partidos, torneos, day-use, perfil
    (club)/           grilla, calendario, torneos, day-use, jugadores, ajustes
    auth/             ingreso y callback
  components/         ui base, cancha, grilla, calendario, hojas
  lib/
    supabase/         clientes de navegador y servidor
    domain/           reglas: sugerencias, americano, recompensas
  supabase/
    migrations/       esquema versionado
    tests/            pgTAP
    seed.sql          datos de ejemplo
  tests/
    unit/             Vitest
    e2e/              Playwright
  docs/
    prototipo.html
  .github/workflows/  ci.yml, migrate.yml, backup.yml
```

## Costos, límites y riesgos

- Desarrollo y pruebas: USD 0 (Vercel Hobby, Supabase Free).
- Uso comercial: Vercel Pro (USD 20/mes) obligatorio; Supabase Pro (USD 25/mes) recomendado.

| Riesgo | Efecto | Cómo lo manejamos |
| --- | --- | --- |
| Supabase pausa por inactividad | App sin respuesta | Uso diario del piloto; ping programado en GitHub Actions; Pro en producción |
| Vercel pausa por uso comercial en Hobby | App fuera de línea | Pasar a Pro antes de clientes reales |
| Jugadores no dejan WhatsApp | Poca adopción | Link para compartir partidos en el grupo |
| Categorías infladas | Partidos desparejos | Validación de categoría por el club desde fase 1 |
| Transferencias sin confirmar o duplicadas | Diferencias de caja | Estado por pago y quién confirmó; lista de pendientes para recepción |

## Decisiones confirmadas

| Tema | Decisión |
| --- | --- |
| Cliente | Rustic, primer cliente y piloto; `seed.sql` usa sus canchas y horarios reales |
| Logo | Miguel lo pide en SVG; placeholder mientras |
| Categoría suma | Fuera del alcance; solo americano en fase 3 |
| Dedicación | 2 a 3 h/semana con Claude Code |
| Hosting | Vercel Hobby solo para pruebas; Pro antes de clientes reales |
| Repo | Privado, arranca vacío |
| Dominio | Dirección de Vercel |
| Day use | Compra anticipada permitida |
| Pagos | Rustic: transferencia (siempre con comprobante) o efectivo; medios configurables por club |
