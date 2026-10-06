---
feature: campeonatos-inscripcion
type: design
status: design
date: 2026-10-06
branch: feat/campeonatos-inscripcion
references: ../lista-de-espera/design.md, ../fase-3a-torneos/design.md, ../fase-1-reservas/design.md, ../buscador-jugador (components/ui/member-picker.tsx)
---

# campeonatos-inscripcion — design

## Purpose

Campeonatos por parejas con varias categorías (por ejemplo "6ta Libre", "5ta Caballeros", "6ta Damas", "Mixto B") que comparten fechas y canchas. Este subproyecto cubre la configuración y la inscripción: el organizador arma el campeonato, sus ventanas de juego y sus categorías; los miembros se anotan con un compañero (miembro o de afuera); recepción carga parejas, cobra y maneja la lista de espera por categoría. Saca de WhatsApp y de las planillas las inscripciones desordenadas, los horarios imposibles anotados a mano y el "¿quién pagó?".

Es el paso 2 del spec "Campeonatos, lista de espera y ofertas de último momento" (Miguel, 4 de octubre de 2026). Los pasos siguientes: 3, sorteo y programación automática; 4, día del torneo (resultados en vivo, avance a la llave, página pública, modo TV); 5, ofertas de último momento; 6, cierre (ranking del club, placa de campeones, PDF). El americano individual de la fase 3a sigue siendo un torneo aparte.

Respuestas de Rustic al spec: tamaño de zonas, clasificados y cantidad de categorías configurables; tercer set con súper tie-break; los resultados los carga la organización; altas y bajas hasta 24 h antes; tabla de puntos de ranking propuesta (campeón 100, finalista 70, semifinal 50, cuartos 30, octavos 20, zona 10).

## Principles

- **Escrituras solo por funciones de Postgres**: RPCs `security definer`, `search_path = ''`, errores con `private.fail(code)` traducidos en `lib/domain/errors.ts`. `anon` no ejecuta nada: no hay inscripción anónima.
- **Tablas propias**: `tournaments`/`tournament_entries` son de los americanos; los campeonatos usan `championship_*`. Se reutilizan pagos (Cobros), la ocupación de canchas y los avisos de la lista de espera.
- **Un teléfono es un jugador**: la tabla `players` identifica a la gente del campeonato, sea miembro o de afuera.
- **Los estados de todo el ciclo se definen ahora** aunque los usen los subproyectos siguientes, para no migrar después.
- **Pantallas del club en tablas** con filtros y paginado (ver el trabajo de tablas del admin), no en listas de cards.
- Club único (`rustic`).

## Decisiones (brainstorm)

| Tema | Decisión |
| --- | --- |
| Jugadores de afuera | Los carga un miembro (como su compañero) o recepción (parejas completas): nombre, teléfono y categoría declarada. Quedan como jugador sin cuenta en `players`. Sin link público ni escrituras anónimas por ahora. |
| Compañero miembro | No acepta: la pareja queda armada al anotarse; el compañero recibe un aviso y puede darse de baja. |
| Pago | Uno por pareja (precio por pareja), por transferencia con comprobante o efectivo; recepción confirma; aparece en Cobros. Sin plazo automático: el organizador da de baja a quien no paga. |
| Bajas | El jugador se da de baja hasta el cierre de la inscripción (por defecto 24 h antes del primer partido); después, solo el organizador. Si había pagado, el pago va a "Pagos a devolver". El lugar pasa solo a la primera pareja en espera de esa categoría, con aviso. |
| Modelo de jugadores | Tabla `players` por club, con teléfono único y vínculo opcional a `profiles`. |
| Género | Caballeros, damas, mixto o libre (cualquier combinación). No se controla, igual que la categoría declarada. |

## Modelo de datos

- **`championships`**: `club_id`, nombre, reglamento (texto), afiche (`poster_path`, opcional), `status`, `registration_opens_at`, `registration_closes_at` (por defecto 24 h antes del primer partido), `max_categories_per_player` (2), `created_by`.
  - `status`: `draft`, `registration`, `closed`, `drawn`, `published`, `in_progress`, `finished`, `cancelled`. Este subproyecto usa `draft`, `registration`, `closed` y `cancelled`.
- **`championship_windows`**: `championship_id`, fecha, desde, hasta, `court_ids`. Desde que se abre la inscripción cada ventana genera ocupaciones de tipo `championship` en `court_occupancy` (enum nuevo, en su propia migración); al cancelar se liberan.
- **`championship_categories`**: `championship_id`, nombre, género (`men`, `women`, `mixed`, `open`), categoría mínima y máxima de referencia, `min_pairs`, `max_pairs`, precio por pareja, formato (`groups_knockout`, `knockout`, `round_robin`), tamaño de zona (3 o 4), clasificados por zona, `match_rules jsonb` (sets, games, tie-break, tercer set súper tie-break a 10, punto de oro), duración estimada (90 min), cabezas de serie (`ranking` o `manual`), `status` (`open`, `cancelled`, `merged`), `merged_into`.
- **`players`**: `club_id`, nombre, teléfono (normalizado a dígitos, único por club cuando no es nulo), email (opcional), `profile_id` (único, opcional), `created_by`. Un miembro tiene su fila vinculada a su perfil (se crea la primera vez que juega un campeonato).
- **`championship_entries`**: `category_id`, `player1_id`, `player2_id`, categoría declarada de cada uno, `status` (`active`, `waiting`, `withdrawn`, `removed`), `seed`, nota, `created_by`, `created_at`, `ended_at`, `ended_by`. El orden de la lista de espera es `created_at`.
- **`entry_unavailability`**: `entry_id`, fecha, desde, hasta (franjas de 2 horas dentro de las ventanas), más `unavailability_note` en la inscripción y `unavailability_approved` cuando se pasa del 40 %.
- **`payments`** suma `championship_entry_id` (como `tournament_entry_id`); los estados de pago y Cobros se reutilizan.
- RLS: los miembros ven los campeonatos que no están en borrador, sus categorías y ventanas, las parejas (nombres) y sus propias inscripciones con pagos y horarios; el teléfono de un jugador solo lo ven el staff y su compañero. El staff ve todo lo de su club.

## Inscripción

- **Miembro**, desde /campeonatos/[id]: elige la categoría, declara su categoría y elige al compañero, sea miembro (buscador por nombre, el de "Cargar turno") o de afuera (nombre, teléfono, categoría). Si el teléfono ya existe en `players`, se usa ese jugador.
- **Recepción** carga parejas completas desde el panel (miembros, de afuera o mezcla).
- Con cupo la pareja queda `active`; sin cupo, `waiting`.
- El compañero miembro recibe un aviso (`notifications`, campana y mail): "Te anotaron con Ana en 6ta Libre".
- Reglas: inscripción abierta; nadie en dos parejas de la misma categoría; nadie por encima del máximo de categorías del campeonato; los dos jugadores distintos.
- **Horarios imposibles**: cualquiera de los dos o recepción marca franjas de 2 horas dentro de las ventanas, más una nota. Tope del 40 % de las franjas; más necesita aprobación del organizador.
- **Pago**: uno por pareja ("Ya transferí" con comprobante, o efectivo en el club).
- **Bajas**: el jugador, hasta el cierre; el organizador, siempre (antes del sorteo). Pago confirmado → "a devolver". El lugar pasa a la primera en espera (`active`) con aviso.
- **Mover de categoría**: el organizador, antes del sorteo.
- **Al cerrar**: las categorías con menos parejas que el mínimo se marcan; el organizador las fusiona con otra (las parejas pasan a la elegida, respetando su cupo; las que no entran quedan en espera) o las cancela (las parejas quedan `removed`, los pagos a devolver); se avisa a los afectados.
- **Cancelar el campeonato**: en cualquier estado antes de `finished`; libera las canchas, avisa a los inscriptos y deja los pagos a devolver.

## Pantallas

**Jugador**

- Pestaña Torneos: "Campeonatos" (inscripción abierta o próximos) arriba de los americanos.
- /campeonatos/[id]: fechas, ventanas, reglamento, afiche; categorías con cupo ("9 de 12 parejas", "2 en espera") y "Anotarme"; "Tus inscripciones" con pareja, estado (con lugar, o en espera y en qué puesto), pago ("Ya transferí"), horarios imposibles y "Darme de baja".
- Ventana para anotarse: categoría, categoría declarada y compañero (buscador de miembros o "Es de afuera").

**Recepción y admin (/club/torneos)**

- Lista de americanos y campeonatos, con "Nuevo campeonato".
- Crear o editar (borrador): datos, ventanas (filas día, desde, hasta, canchas) y categorías (filas con valores por defecto).
- Gestión: "Abrir inscripción", "Cerrar inscripción", "Cancelar campeonato"; por categoría, una tabla de parejas con estado de pago, "Cobrar", "Quitar", "Mover a otra categoría", filtros (estado, pago) y búsqueda por nombre; la lista de espera; "Cargar pareja". Al cerrar, categorías con pocas parejas marcadas con "Fusionar con…" y "Cancelar categoría".
- Grilla: las ventanas bloquean con un estilo propio ("Campeonato").
- Cobros: los pagos de inscripciones junto a reservas, americanos y day use.

## Tests

- **pgTAP**: un teléfono es un solo jugador; nadie dos veces en una categoría ni por encima del máximo; sin cupo queda en espera; la baja pasa el lugar a la primera en espera con aviso; baja del jugador hasta el cierre y después solo del organizador; pago en Cobros y "a devolver" al darse de baja pagado; ventanas que bloquean al abrir y liberan al cancelar; tope del 40 %; fusionar y cancelar categorías; RLS (borradores solo staff, teléfonos solo staff y compañero).
- **Vitest**: formularios, textos, estados y tablas.
- **Playwright**: el admin crea un campeonato con dos categorías y abre la inscripción; un miembro se anota con un compañero de afuera; recepción cobra; se llena el cupo y la siguiente queda en espera; una baja hace entrar a la de espera.

## Fuera de alcance

- Sorteo, programación automática y ajuste manual (paso 3).
- Día del torneo, página pública, "Mis partidos" y modo TV (paso 4).
- Ranking, placa de campeones y PDF (paso 6).
- Link público sin login y reclamar el perfil del jugador de afuera.
- Plazo automático de pago y política de devolución por porcentaje.

## Open questions

- Ninguna bloqueante. El afiche usa un bucket público como el logo del club.
