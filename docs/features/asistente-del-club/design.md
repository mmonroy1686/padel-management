---
feature: asistente-del-club
type: design
status: done
date: 2026-11-23
branch: feat/asistente-del-club
references: ../fase-2-partidos/design.md, ../marca-del-club/design.md, ../inicio-cancha/design.md
---

# asistente-del-club — design

## Purpose

Un asistente guiado para recepción y admin (`/club/asistente`) que ayuda a llenar las canchas:

- Muestra los turnos libres y ocupados de un día como el flyer que los clubes ya mandan por WhatsApp, y genera esa imagen y el texto para compartir.
- Propone en qué huecos conviene armar un partido, mirando los hábitos de los jugadores (cuándo jugaron, cuándo dicen estar libres) y con una categoría flexible (un 6ª entra en un 5ª/6ª).
- Crea el partido abierto con los 4 lugares libres e invita a los jugadores sugeridos con un aviso en la app y un mensaje de WhatsApp.

## Principles

- Guiado con reglas, sin IA: determinístico, testeable y sin costo por uso.
- Reusar lo que hay: la grilla del día (`loadDayGrid`), los partidos abiertos, `match_suggestions` y su puntaje, `whatsappUrl`, los avisos (`notification_outbox`) y las imágenes con `next/og` y la marca del club.
- La lógica es pura y testeada en `lib/domain/slot-planner.ts` y `lib/domain/free-slots-flyer.ts`. Las escrituras van por RPC security definer con `search_path = ''` y `private.fail`.
- Mobile first, con botones de al menos 44 px. Lo ocupado se dice con texto y tachado, no solo con color. Contraste de 4.5:1 con la marca.

## Decisiones (brainstorm 2026-11-23)

| Tema | Decisión |
| --- | --- |
| Crear turno | Las dos cosas: flyer de libres del día, y en cada hueco se puede crear un partido abierto e invitar a los sugeridos. |
| IA o reglas | Guiado con reglas. |
| Flyer | Un día, con el teléfono/WhatsApp del club (campo nuevo en Ajustes) y formato vertical de 1080×1920. |
| Invitar | Aviso en la app y mail (`match_invite`), más un botón de WhatsApp con el mensaje armado. |
| Dónde | Pantalla nueva `/club/asistente`, con una pestaña en el menú del club. |
| Propuesta | Según los hábitos de los jugadores (veces jugadas ese día y hora, disponibilidad declarada, cancha preferida), con un rango de dos categorías seguidas. |

## La pantalla, de arriba a abajo

1. **Día:** la tira de días de la Grilla. Por defecto, hoy.
2. **Recomendados para armar:** los 3 huecos de más demanda, por ejemplo "Martes 19:00 · Cancha 2 · 5ª/6ª mixto · 8 posibles", con el botón "Armar". Si no hay ninguno con demanda media o alta, no aparece.
3. **Tablero de libres:** canchas en columnas y horarios en chips.
   - Un libre se puede tocar, tiene borde de acento y muestra la demanda: "🔥 8 posibles" (alta), "5 posibles" (media) o nada.
   - Uno ocupado aparece tachado y dice "Ocupado" para el lector de pantalla.
   - Uno con un partido armándose dice "Armándose 2/4" y lleva al partido.
   - Los horarios pasados no se muestran. Si no queda ninguno libre: "No quedan turnos libres este día."
4. **Difundir libres:** la vista previa del flyer, con "Compartir imagen" (Web Share con el archivo, o descarga si no está), "Copiar texto" y "Abrir WhatsApp". El texto:
   ```
   🎾 Turnos libres — lunes 24/11
   Cancha 1: 14:30 · 16:00 · 17:30
   Cancha 2: 16:00 · 20:30
   Reservá: <link de la app> · WhatsApp 092 369 558
   ```
5. **Armar partido** (una hoja al tocar un libre o "Armar"):
   - El encabezado, por ejemplo "Armar partido · Cancha 2 · 16:00".
   - Rango de categoría, tipo (mixto, masculino o femenino) y "Puede ir a otra cancha", precargados con la propuesta.
   - Debajo, los candidatos que entran con esa elección, con chips de motivos: "Jugó 4 veces los martes 19:00", "Suele estar libre los martes de noche", "6ª, entra en 5ª/6ª". Si faltan jugadores de un lado: "Pocos de revés".
   - "Crear partido" lo crea con los 4 lugares libres.
6. **Invitar** (la misma hoja, ya con el partido creado):
   - La lista de `match_suggestions`, cada uno con "Invitar" (aviso en la app y mail) y "WhatsApp" (`inviteText` con el link del partido).
   - "Invitar a los mejores 8".
   - Los invitados quedan marcados "Invitado ✓" y no se los puede invitar otra vez al mismo partido.

En el celular va todo en una columna; en escritorio, el tablero queda a la izquierda y la vista previa a la derecha.

## Lógica de propuesta (lib/domain/slot-planner.ts)

- **Entrada:** las filas de `slot_candidates` de un hueco.
- **Candidato fuerte:** jugó 2 veces o más ese día de la semana y a esa hora (±30 min), o suele estar libre en esa franja.
- **Rango de categoría:**
  - Si una sola categoría tiene 4 o más candidatos fuertes, propone esa sola.
  - Si no, propone el par de categorías seguidas (n, n+1) que junta más candidatos fuertes. Si empatan, gana el que junta más puntaje total y, si siguen empatados, la categoría más baja.
- **Tipo:** si 4 o más de los candidatos fuertes del rango son del mismo género, propone ese tipo; si no, mixto.
- **Lados:** si hay menos de 2 candidatos fuertes de un lado (contando los que juegan en los dos), avisa "Pocos de drive" o "Pocos de revés".
- **Demanda:** alta con 6 o más candidatos fuertes en el rango, media con 3 a 5, baja con menos.
- **Recomendados:** los huecos libres que todavía aceptan partido (antes del cierre), ordenados por demanda, candidatos fuertes y hora. Hasta 3, y nunca dos en el mismo horario.
- **`candidatesFor(rows, choice)`:** filtra por el rango y el tipo elegidos, ordena por puntaje y arma los chips.

## Flyer (lib/domain/free-slots-flyer.ts)

- `flyerLayout(grid, now)`: las columnas (canchas activas) y las filas (horarios del día), con el estado de cada celda: libre, ocupado, pasado o sin turno. Con 6 canchas o más usa columnas angostas; con más de 8 horarios, píldoras más chicas.
- `flyerText(input)`: el texto para WhatsApp, solo con los horarios libres.
- La imagen la genera la ruta `app/(club)/club/asistente/flyer/route.tsx`, un `ImageResponse` de 1080×1920 con `?date=YYYY-MM-DD`:
  - Fondo con el color de marca y título "TURNOS LIBRES".
  - El día, las canchas en columnas y los horarios en píldoras con el color de acento; los ocupados con una cruz.
  - Abajo, el logo y "Consultanos: 092 369 558", o el link de la app si no hay teléfono.
  - Solo staff. Sin foto de fondo.

## Base de datos

- **`clubs.phone`:** texto opcional, solo dígitos (con `private.normalize_phone`). Se edita en Ajustes, en "WhatsApp del club".
- **`slot_candidates(p_court_id, p_starts_at)`:** solo staff. Devuelve los socios activos, sin perfil privado y libres a esa hora (`is_busy`):
  - Nombre, categoría, lado y género.
  - `times_played` (ese día de la semana, ±30 min, de reservas y partidos jugados) y `usually_free` (por la franja de su disponibilidad).
  - `prefers_court` y `score`, con los mismos pesos que `match_suggestions`.
- **`staff_create_match(p_court_id, p_starts_at, p_allow_other_court, p_category_min, p_category_max, p_match_type)`:**
  - Solo staff, con las mismas validaciones que `create_match`: horario pasado, ventana, cierre, precio y cancha ocupada.
  - Deja los 4 lugares libres y `created_by` queda como el staff.
  - Hay que revisar que nada asuma que el creador juega (avisos, salir del partido, vista "Mis partidos").
- **`match_invites`:** (match_id, player_id, invited_by, created_at), con clave única (match_id, player_id). RLS de lectura para staff del club.
- **`invite_to_match(p_match_id, p_player_ids uuid[])`:**
  - Solo staff, y solo partidos que se están armando.
  - Ignora a quien ya juega o ya fue invitado, y devuelve cuántos invitó.
  - Por cada invitado nuevo inserta en `notification_outbox` un aviso `match_invite` con el día, la hora, la cancha y la categoría, y el link `/partidos/<id>`.
- **Aviso `match_invite`:** "Te invitan a un partido", con el cuerpo "Martes 24/11 19:00 · Cancha 2 · 5ª/6ª mixto", el botón "Ver el partido" y el motivo "te escribimos porque el club te invitó a un partido".

## Componentes

- `app/(club)/club/asistente/page.tsx`: lee la grilla del día, los partidos que se arman, los candidatos de cada hueco libre y el club (teléfono y marca).
- `components/assistant/free-board.tsx`: el tablero de libres.
- `components/assistant/recommended-slots.tsx`.
- `components/assistant/flyer-share.tsx`: la vista previa y los tres botones.
- `components/assistant/build-match-sheet.tsx`: el formulario, los candidatos y la invitación.
- `components/assistant/invite-list.tsx`.
- La pestaña "Asistente" en `lib/club/tabs.ts`.
- En Ajustes, el campo "WhatsApp del club".

## Datos

- `lib/data/assistant.ts` tiene `loadAssistantDay(club, date, now)`, que carga en paralelo:
  - La grilla del día (`loadDayGrid`).
  - Los partidos que se arman ese día.
  - `slot_candidates` de cada hueco libre futuro. Son una llamada por hueco, como máximo unas 40 en un día; si llega a pesar, se juntan en un RPC por día.

## Tests

- **Vitest, dominio:**
  - `slot-planner`: una categoría sola, un par flexible, empates, tipo, lados, demanda y recomendados (sin repetir horario, sin huecos cerrados).
  - `flyerLayout` (estados y tamaños) y `flyerText`.
  - El aviso `match_invite`.
- **Vitest, componentes:**
  - El tablero (libre, ocupado tachado con texto, armándose, demanda).
  - La hoja de armar (precargada, cambiar el rango filtra candidatos, crear).
  - La lista de invitados ("Invitado ✓" y el WhatsApp).
  - Compartir el flyer (sin Web Share descarga).
- **pgTAP:**
  - `slot_candidates`: solo staff, excluye a los ocupados y los privados, y cuenta `times_played`.
  - `staff_create_match`: las validaciones y los 4 lugares libres.
  - `invite_to_match`: no invita dos veces, ignora a los que ya juegan y crea el aviso.
  - `clubs.phone`.
- **Playwright:** recepción elige el día, ve los libres, abre un recomendado, crea el partido e invita a un sugerido, y el jugador ve el aviso en `/avisos`.

## Fuera de alcance

- IA o chat.
- Teléfonos de los socios.
- Envíos programados o automáticos.
- Flyers de varios días y fotos de fondo.

## Open questions

- Ninguna.
