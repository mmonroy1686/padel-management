---
name: Rustic Pádel
description: La app de un club de pádel, para el jugador y para el mostrador; cada club pone sus colores.
colors:
  club-primary: "#FCB021"
  club-primary-ink-light: "#8A5A00"
  night: "#021716"
  night-surface: "#0A2624"
  night-border: "#1E3A38"
  night-fg-muted: "#B8C4C3"
  day-bg: "#FFFFFF"
  day-surface: "#F1F4F4"
  day-border: "#D5DCDB"
  day-fg-muted: "#4A5857"
  court-blue: "#025995"
  court-blue-light: "#4DA3DB"
  danger-on-night: "#FF8A7A"
  danger-on-day: "#B42318"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
  headline:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  gutter: "16px"
  section: "32px"
  touch: "44px"
components:
  button-primary:
    backgroundColor: "{colors.club-primary}"
    textColor: "{colors.night}"
    typography: "{typography.headline}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-outline:
    textColor: "{colors.night}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.day-surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.day-bg}"
    textColor: "{colors.night}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.night}"
    textColor: "{colors.day-bg}"
    rounded: "{rounded.full}"
    height: "44px"
  court-block:
    backgroundColor: "{colors.court-blue}"
    textColor: "{colors.day-bg}"
    rounded: "{rounded.lg}"
---

# Design System: Rustic Pádel

## Overview

**Creative North Star: "El mostrador del club"**

Todo se diseña para quien atiende con gente esperando, y para el jugador que reserva con el celular en la mano entre dos cosas. Cada pantalla tiene una sola acción principal y la plata siempre a la vista, escrita dentro de la frase ("Debe $1.200", "Cobramos $4.800 en efectivo a Nicolás Rodríguez."). El color del club aparece solo donde hay que actuar. El tono es sobrio y preciso: una herramienta de trabajo que se siente del club por los detalles (la cancha dibujada, el voseo, la tipografía condensada), no por la decoración.

La app es multi-club: cada club elige su color principal y su fondo en Ajustes → Club, y la app arma el resto (modo oscuro y claro, el tono del texto sobre ese color) corrigiendo lo que haga falta para que se lea. Rustic usa amarillo sobre verde noche; ninguna regla de este documento depende de ese tono. Las listas son filas con una línea entre ellas, no pilas de tarjetas; lo que no hace falta ahora se pliega (grupos, transferencias, «El club»).

**Key Characteristics:**
- Un solo uso del color del club por pantalla: la acción que vinimos a hacer.
- Filas antes que tarjetas; una acción por fila.
- "Elegido" en tinta invertida, nunca en el color del club.
- Voseo rioplatense y montos dentro de las frases.
- Mobile primero: todo se toca con el pulgar (44px), nada se desliza de costado salvo las tiras de días.

## Colors

Una paleta de dos capas: neutros fijos (noche y día) y un color del club que cada club cambia.

### Primary
- **Color del club** (`club-primary`, Rustic #FCB021): el botón principal de la pantalla, el resultado de un cobro, el lugar "Falta" de una pareja, la pestaña activa (como tinte suave). Lo elige cada club; nunca se escribe un tono fijo en el código, siempre el token `accent`.
- **Tinta del club sobre claro** (`club-primary-ink-light`, Rustic #8A5A00): el mismo color oscurecido para texto y links sobre fondo claro (token `accent-ink`), calculado para pasar 4.5:1.

### Secondary
- **Azul cancha** (`court-blue` #025995, `court-blue-light` #4DA3DB): la cancha dibujada (parejas, turnos del Inicio, vista previa de la marca) y lo cobrado ("Cobrado hoy", "Pagó ✓"). Es el color del deporte, no de la marca: no cambia con el club.

### Neutral
- **Noche** (`night` #021716, `night-surface` #0A2624, `night-border` #1E3A38, `night-fg-muted` #B8C4C3): el modo oscuro, el de siempre en la cancha de noche.
- **Día** (`day-bg` #FFFFFF, `day-surface` #F1F4F4, `day-border` #D5DCDB, `day-fg-muted` #4A5857): el modo claro.
- **Peligro** (`danger-on-night` #FF8A7A, `danger-on-day` #B42318): solo errores y lo que se devuelve; nunca para destacar.

### Named Rules
**The One Voice Rule.** El color del club se usa una vez por pantalla, en la acción que vinimos a hacer. Las acciones de fila (Cobrar, Sumarme, Revisar) van con borde neutro; el color vuelve en la elección que abren (Efectivo / POS).

**The Ink Selection Rule.** Lo elegido en un conjunto (día, filtro, carril, cancha, sección de Ajustes) se marca con tinta invertida (`SELECTED`: fondo `fg`, texto `bg`). El color del club nunca significa "elegido".

**The Information Is Not Action Rule.** Barras de tiempo, de ocupación y de cupo van en tinta (`fg-muted` sobre `border`). Que el tiempo pase es información, no algo para hacer.

## Typography

**Display Font:** Barlow Condensed 700 (con Barlow)
**Body Font:** Barlow 400/500/600 (con ui-sans-serif, system-ui)

**Character:** La condensada en mayúsculas es la voz deportiva del club, reservada para títulos de pantalla y botones principales; Barlow normal hace todo el trabajo de lectura.

### Hierarchy
- **Display** (700, 2.25rem, 1.1, mayúsculas): el título de cada pantalla ("RESERVAR CANCHA", "COBROS") y los montos grandes.
- **Headline** (700, 1.25rem, mayúsculas, tracking amplio): botones principales y fechas de tarjetas ("MAÑANA 21:30").
- **Title** (600, 1.125rem): títulos de sección, siempre en minúscula normal ("En cancha ahora", "Sin cobrar").
- **Body** (400, 1rem, 1.5): todo lo que se lee; nunca menos de 16px en un campo.
- **Label** (600, 0.875rem): nombres de campos, acciones de fila, detalle de filas en `fg-muted`.

### Named Rules
**The One Shout Rule.** Mayúsculas condensadas solo para el título de la pantalla y su botón principal. Las secciones van en minúscula normal; si todo grita, nada se oye.

## Layout

Una columna en el celular con 16px de margen; dos columnas desde tablet donde el contenido lo pide (Inicio del jugador, Cobros en escritorio). Las secciones se separan con espacio (32px), no con bordes ni tarjetas. Las listas son filas con divisor (`divide-y`) entre un borde arriba y otro abajo. La barra inferior es fija (5 destinos como máximo: los 4 del día y "Más"); en el panel del club, las pestañas de arriba aparecen recién desde tablet. Todo lo tocable mide 44px de alto mínimo. Lo que va fijo abajo (confirmar transferencias marcadas, la barra de cobro) se apoya sobre la barra de navegación y deja espacio al final de la página para que nada quede tapado. En el celular la Grilla del club muestra una cancha por vez (decisión del dueño).

## Elevation & Depth

Plano por defecto: la profundidad se marca con capas de tono (fondo → `surface` → borde), no con sombras. La única sombra es la de lo que flota sobre la lista: la barra de confirmación de cobro y las hojas que suben desde abajo.

### Named Rules
**The Flat Desk Rule.** Nada tiene sombra en reposo. Si algo flota sobre el contenido (hoja, barra de cobro), lleva sombra; si no flota, no.

## Shapes

Esquinas suaves y consistentes: 12px en botones y campos, 16px en tarjetas, la cancha dibujada y las hojas; píldora completa en chips de días, filtros y carriles. Los lugares vacíos de una pareja ("Falta") llevan borde punteado en el color del club. Los íconos son de línea, 24px de grilla, en el color del texto; las marcas de WhatsApp e Instagram son rellenas, de Simple Icons.

## Components

### Buttons
- **Shape:** esquinas suaves (12px), 44px de alto mínimo; se achican apenas al presionar (scale 0.97).
- **Primary:** relleno en el color del club, texto `on-accent`, condensada en mayúsculas. Uno por pantalla.
- **Secondary:** borde de 2px en el color del club y un tinte suave detrás; para la segunda acción de una pantalla (no de una fila).
- **Outline:** borde neutro de 2px, texto en tinta; la acción de cada fila de una lista. Toma el color del club solo al pasar el mouse.
- **Ghost:** solo texto; "Volver", "Cerrar", acciones menores.
- **Danger:** borde y texto de peligro; poco usado ("Anular" va como ghost con doble toque).

### Chips
- **Style:** píldora, borde `border`, fondo `surface`.
- **State:** elegido = tinta invertida (The Ink Selection Rule). Los chips de próximos turnos del Inicio del jugador son links ("14:00 Cancha 2") que abren directo la hoja de reserva.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** `surface` con borde `border`.
- **Shadow Strategy:** ninguna (The Flat Desk Rule).
- **Internal Padding:** 16px.
- Una tarjeta que lleva a algo se abre entera (su link "Ver …" cubre la tarjeta, `CARD_LINK`); los botones adentro quedan por encima.

### Inputs / Fields
- **Style:** fondo `bg`, borde `border`, 12px, 44px de alto, etiqueta visible arriba y ayuda abajo.
- **Focus:** contorno de 2px en el color del club.
- **Guardado:** los formularios de ajustes y perfil se guardan solos ("Guardando…", "Guardado" con tilde, error con "Reintentar"); el logo se sube al elegirlo.

### Navigation
- **Barra inferior** (celular): ícono y etiqueta, la activa con un tinte suave del color del club detrás del ícono. Jugador: Inicio · Reservar · Partidos · Torneos · Perfil. Club: Inicio · Grilla · Cobros · (Ajustes para el admin / Day use para recepción) · Más.
- **"Más":** hoja con las demás secciones, cada una con una línea que dice para qué es.
- **Ajustes:** un índice de filas en el celular; cada sección abre en su pantalla con "‹ Ajustes"; en escritorio, menú lateral.

### La cancha dibujada (signature)
Un rectángulo azul cancha con la red al medio y cuatro lugares (dos por lado). Cada lugar dice el nombre y el lado (Drive / Revés) o "Falta" con borde punteado en el color del club; en el panel, cada lugar dice "Pagó ✓" o el botón para cobrar su parte. Se usa en Partidos, en el turno abierto del Inicio del club y en la vista previa de la marca.

### La barra de cobro (signature)
Fija abajo, sobre la barra de navegación: tilde, la frase con monto, forma de pago y persona, "Deshacer" (30 segundos, todo o nada) y una X. Cuando vence el Deshacer se va sola; si fue un error, queda hasta cerrarla.

## Do's and Don'ts

### Do:
- **Do** usar los tokens (`accent`, `accent-ink`, `fg`, `border`, `SELECTED`) y nunca un color escrito: cada club cambia el suyo.
- **Do** poner una sola acción en el color del club por pantalla (The One Voice Rule).
- **Do** mostrar listas como filas con divisor, con una acción por fila y el nombre completo (no cortarlo: es como recepción encuentra a la persona).
- **Do** escribir el monto dentro de la frase: "Cobrar $300 a Paula", "Debe $1.200".
- **Do** plegar lo que no se usa ahora (deudas agrupadas, transferencias, «El club») y abrirlo en el lugar.
- **Do** dar 44px a todo lo tocable y respetar prefers-reduced-motion.

### Don't:
- **Don't** usar el color del club para marcar lo elegido, el tiempo, la ocupación ni la navegación.
- **Don't** apilar tarjetas con etiquetas en mayúscula (QUIÉN / CÓDIGO / ESTADO) en el celular: filas.
- **Don't** poner títulos de sección en mayúsculas condensadas (The One Shout Rule).
- **Don't** agregar sombras a cosas que no flotan (The Flat Desk Rule).
- **Don't** usar emoji como íconos ni mezclar estilos de íconos.
