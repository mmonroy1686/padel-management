---
feature: marca-del-club
type: design
status: approved
date: 2026-10-13
branch: feat/marca-del-club
references: ../fase-1-reservas/design.md, ../lista-de-espera/design.md, ../campeonatos-dia-del-torneo/design.md
---

# marca-del-club — design

## Purpose

Que cada club vea la app con su identidad: el admin elige en Ajustes el color principal, el color de fondo y el modo (oscuro, claro o según el dispositivo), y la app, el ícono, la vista previa al compartir un link, los mails y el modo TV toman esa marca. Sirve para mostrarle la app a otro club con sus colores y es el primer paso hacia el SaaS. De paso, el lugar que falta en la cancha de un partido abierto deja de confundirse con los lugares ocupados.

## Principles

- **Se guardan dos colores y un modo; el resto se calcula.** Una función pura (`clubTheme`) arma todos los tokens al mostrar, con contraste mínimo 4.5:1. Mejorar el cálculo llega a todos los clubes sin migrar datos.
- **Los tokens que ya existen son el contrato.** Los componentes siguen usando `bg`, `surface`, `accent`, `accent-ink`, etc.; solo cambia de dónde salen sus valores. Ningún componente lee los colores del club directo.
- **Escrituras por RPC** (`security definer`, `search_path = ''`, `private.fail(code)`), como el resto de la app. Solo el admin del club.
- **Con los valores por defecto, Rustic se ve exactamente como hoy.**

## Decisiones (brainstorm)

| Tema | Decisión |
| --- | --- |
| Alcance | Marca visual: colores, logo (ya existe) y nombre. Sin ficha del club ni multi-club. |
| Colores | Color libre: principal y fondo. La app calcula el resto y corrige el contraste. |
| Qué colores | Principal (hoy el ámbar) y fondo (hoy el verde noche). El azul de las reservas y el rojo de error quedan fijos. |
| Claro / oscuro | Lo decide el club: según el dispositivo (por defecto, como hoy), siempre oscuro o siempre claro. |
| Dónde se ve | La app, el ícono y la pestaña, la vista previa en WhatsApp, los mails de avisos y el modo TV. |
| Tipografía | Fija (Barlow Condensed y Barlow); no es parte de la marca del club. |
| Enfoque | Calcular el tema al mostrar (no guardar el tema calculado, no aplicarlo en el navegador). |
| Lugar que falta | "Hueco oscuro": fondo del club, borde punteado y "Falta" en el color principal como texto. |

## Datos

- `clubs` suma:
  - `brand_primary text not null default '#FCB021'`, con check `^#[0-9A-F]{6}$` (se guarda en mayúsculas).
  - `brand_background text not null default '#021716'`, mismo check.
  - `color_mode` enum `club_color_mode` (`system`, `dark`, `light`), `not null default 'system'`. El enum va solo en su propia migración.
- **RPC `save_club_brand(primary text, background text, mode club_color_mode)`**: solo admin del club; normaliza a mayúsculas; un hex inválido falla con `invalid_color`. El logo sigue con su flujo actual (`logo_path`).
- Los tres campos se leen donde ya se lee el club (`name`, `logo_path`); la página pública y la TV los reciben por `public_championship(code)` o la lectura pública del club que ya usan, sin abrir nada nuevo a `anon` más allá de esos tres valores.

## Cálculo del tema

`lib/domain/club-theme.ts`, puro, sin dependencias:

- `clubTheme({ primary, background })` → `{ dark: Tokens, light: Tokens, adjusted: Adjustment[] }`. `Tokens` = `bg`, `surface`, `border`, `fg`, `fg-muted`, `accent`, `on-accent`, `accent-ink`, `court`, `on-court`, `court-ink`, `danger`.
- **Modo oscuro**: `bg` = el fondo; si el fondo es claro (luminancia alta), se oscurece hasta servir de fondo oscuro. `surface` y `border` = `bg` aclarado en pasos fijos. `fg` y `fg-muted` = casi blanco y gris, con un tinte leve del fondo, y siempre ≥ 4.5:1 sobre `surface`.
- **Principal**: `accent` = el principal tal cual; `on-accent` = negro o blanco, el de mayor contraste; `accent-ink` = el principal como texto, aclarado u oscurecido hasta ≥ 4.5:1 sobre `bg` y `surface` de ese modo.
- **Modo claro**: `bg` blanco con un tinte mínimo del fondo; `surface` y `border` en grises tintados; `accent-ink` oscurecido hasta ≥ 4.5:1 (lo que hoy es `#8A5A00` para el ámbar).
- `court`, `on-court`, `court-ink` y `danger`: los valores fijos de hoy por modo.
- `adjusted`: qué se corrigió y en qué modo (para el aviso en Ajustes).
- Con `#FCB021` y `#021716` devuelve exactamente la paleta actual de `app/globals.css`.
- Un valor inválido (no hex) cae a los colores por defecto en vez de romper.
- `themeCss(theme, mode)` → el texto CSS: con `system`, `:root` oscuro más `@media (prefers-color-scheme: light)`; con `dark` o `light`, solo esa versión y su `color-scheme`.

## Aplicación

- El layout raíz lee la marca del club (`CLUB_SLUG`) y escribe `<style>` con `themeCss(...)` desde el servidor: sin parpadeo. `app/globals.css` conserva los valores de hoy como respaldo y sigue mapeando los tokens a Tailwind.
- Nada de los componentes cambia, salvo los dos puntos de abajo.

## Ajustes: "Marca del club"

En Ajustes, solo admin, junto al logo:

- **Color principal** y **color de fondo**: selector de color del navegador y, al lado, un campo `#RRGGBB` para pegar el color exacto.
- **Modo**: "Según el dispositivo", "Siempre oscuro", "Siempre claro".
- **Vista previa en vivo** (antes de guardar), oscuro y claro lado a lado: encabezado con logo y nombre, un botón principal, una tarjeta con texto suave, la etiqueta "En juego" y una cancha con un lugar ocupado y uno que falta. Usa `clubTheme` en el navegador, aplicado a un contenedor con las variables.
- **Aviso** de una línea cuando el cálculo corrigió algo ("Tu amarillo como texto sobre fondo claro se oscurece un poco para que se lea.").
- **"Guardar marca"** y **"Volver a los colores originales"**. Al guardar, la app toma los colores al recargar.

## Ícono, vista previa, mails y TV

- **Ícono**: `app/icon.tsx` y `app/apple-icon.tsx` con `ImageResponse`: el logo sobre el fondo del club; sin logo, las iniciales sobre el principal. Reemplaza `app/icon.svg`.
- **Manifest**: `app/manifest.ts` con nombre del club, `theme_color` y `background_color`, y los íconos.
- **Vista previa al compartir**: `opengraph-image` 1200×630 con el fondo, el logo y un título, más `generateMetadata` (título y descripción):
  - página pública del campeonato: nombre y fecha del campeonato;
  - partido abierto: "Falta 1 de revés · jue 20:00" (solo día, hora y lo que falta; nunca nombres);
  - el resto: el nombre del club.
- **Mails** (`lib/notify/messages.ts`): los colores salen de `clubTheme(...).dark` en vez de `COLORS`. Siempre la versión oscura.
- **Modo TV**: ya usa los tokens; suma el logo del club en grande en el encabezado.

## Lugar que falta en la cancha

En `components/matches/match-court.tsx`, el lugar vacío que no se puede tomar pasa de "azul con borde punteado blanco" a **hueco oscuro**: fondo `bg`, borde punteado `accent`, "Falta" y el lado en `accent-ink`. El ocupado sigue azul con borde claro y "Sumarme" sigue en el principal lleno, así los tres estados se distinguen sin depender solo del color (texto distinto en cada uno).

## Tests

- **pgTAP**: solo el admin del club guarda la marca (recepción, jugador y otro club no); hex inválidos (`#FFF`, `rojo`, `#GGGGGG`) fallan con `invalid_color`; los valores por defecto; normaliza a mayúsculas.
- **Vitest**:
  - `clubTheme`: principales ámbar, amarillo, blanco, negro, azul por fondos oscuro, claro y medio — todo texto ≥ 4.5:1 sobre su fondo en los dos modos; los valores de hoy dan la paleta actual; `adjusted` solo cuando hubo corrección; valor inválido → por defecto.
  - `themeCss` en los tres modos.
  - Formulario de Ajustes: vista previa, aviso, volver a los originales.
  - `MatchCourt`: el lugar que falta no tiene la clase de la cancha y dice "Falta".
  - Mails con los colores del club.
- **Playwright**: el admin cambia el principal, guarda, y la grilla y la página pública del campeonato lo muestran.

## Fuera de alcance

- Tipografía por club.
- Subdominio o link por club (multi-club).
- Más colores (el azul de las reservas queda fijo).
- Temas por temporada.

## Open questions

- Ninguna.
