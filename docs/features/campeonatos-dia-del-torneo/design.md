---
feature: campeonatos-dia-del-torneo
type: design
status: approved
date: 2026-10-06
branch: feat/campeonatos-dia-del-torneo
references: ../campeonatos-inscripcion/design.md, ../lista-de-espera/design.md
---

# campeonatos-dia-del-torneo — design

## Purpose

Lleva un campeonato desde la inscripción cerrada hasta los campeones: sorteo de zonas y llaves, programación automática de todos los partidos en canchas y horarios, publicación del fixture, carga de resultados el día del torneo con avance automático a la llave, una página pública en vivo para compartir y un modo TV para el club. Pasos 3 y 4 del spec "Campeonatos, lista de espera y ofertas de último momento" (Miguel, 4 de octubre de 2026), sobre `campeonatos-inscripcion`.

## Principles

- **Lógica pura en TypeScript, reglas guardadas en Postgres.** El sorteo y el programador son funciones deterministas en `lib/domain` (Vitest). Una Server Action las corre y manda el resultado a una RPC `security definer` que vuelve a validar las reglas obligatorias y guarda todo en una transacción. Nada de la lógica queda atado a Supabase.
- **Escrituras solo por RPCs** con `search_path = ''` y `private.fail(code)`. Única excepción a "anon no ejecuta nada": `public_championship(code)`, de solo lectura y con datos públicos, documentada y fijada por `integrity.test.sql`.
- **Los resultados los carga la organización** (staff del club).
- **Núcleo primero:** sin recálculo de horarios en cadena, llamado a cancha, suspensión por lluvia ni avisos de "tu partido es en 30 minutos".
- Club único (`rustic`).

## Decisiones (brainstorm)

| Tema | Decisión |
| --- | --- |
| Link | Público sin login en `/c/<código>`, más lo propio del socio dentro de la app ("Mis partidos", inscripciones, pagos). |
| Ajuste del fixture | Ventana por partido: otra cancha y horario de una lista de opciones válidas, o fijarlo. "Volver a programar" respeta los fijados. Sin arrastrar y soltar. |
| Cabezas de serie | Por categoría declarada (menor suma = más fuerte), con ajuste a mano antes de sortear. Cuando exista el ranking, pasa a ser el criterio principal. |
| Día del torneo | Núcleo: estados del partido, resultados por set validados, avance automático, página pública en vivo, modo TV, "Mis partidos", mover un partido, compartir. |
| Enfoque | Sorteo y programador en TS; RPC que valida y guarda. |

## Modelo de datos

- **`championships`** suma `public_code text unique` (corto, legible: `primavera-7k2f`) y `draw_seed integer`.
- **`championship_groups`**: `category_id`, `name` ("Zona A"), `sort_order`.
- **`championship_group_members`**: `group_id`, `entry_id`, `draw_position`. La tabla de posiciones se calcula desde los partidos.
- **`championship_matches`**: `category_id`, `stage` (`group`, `knockout`), `group_id`, `round` (llave: 1 = final, 2 = semis, 4 = cuartos…), `bracket_position`, `entry_a_id`, `entry_b_id`, `source_a`/`source_b` (jsonb: `{"group": id, "place": 1}`, `{"winner_of": match_id}` o `{"bye": true}`), `court_id`, `starts_at`, `ends_at`, `pinned boolean`, `status` (`scheduled`, `playing`, `finished`, `walkover`), `winner_entry_id`, `walkover_entry_id`, `recorded_by`, `recorded_at`.
- **`championship_match_sets`**: `match_id`, `set_number`, `games_a`, `games_b`, `super_tiebreak boolean`.
- Los partidos programados no generan ocupaciones nuevas: la ventana del campeonato ya bloquea la grilla. Publicar puede devolver franjas de ventana sin partidos (borra esas ocupaciones; el trigger de la lista de espera las ofrece).
- RLS: miembros leen grupos, partidos y sets de campeonatos fuera de borrador; staff, todo lo de su club. Nadie escribe directo.
- **`public_championship(code)`** (`anon` y `authenticated`): JSON con nombre, fechas, reglamento, categorías (nombre, género, reglas), zonas con parejas (solo nombres), partidos (cancha, horario, estado, sets, ganador) y llaves. Vacío si el campeonato está en borrador o cancelado. Sin teléfonos, pagos, notas ni ids de perfil.

## Sorteo

- Entra solo con el campeonato `closed`. Parejas `active` de cada categoría abierta.
- Cabezas de serie: orden por suma de categorías declaradas (menor primero; desempate por orden de inscripción), una por zona; el organizador puede fijar las suyas (`championship_entries.seed`) antes de sortear.
- Zonas + llave: zonas de 3 o 4 según la categoría; si no divide justo, se combinan (10 = 3+3+4). Serpentina por nivel. Llave de la potencia de 2 que alcanza a los clasificados; *byes* a los mejores primeros; primeros contra segundos de otra zona, nunca dos de la misma zona en la primera ronda.
- Eliminación directa: llave desde el inicio, *byes* a los cabezas de serie.
- Todos contra todos: una sola zona.
- Semilla guardada (`draw_seed`): el mismo sorteo da lo mismo. "Volver a sortear" mientras no se publicó (cambia la semilla).
- Estado `closed` → `drawn`.

## Programación

- Todos los partidos de todas las categorías, los de llave con nombre provisorio ("1° Zona A", "Ganador SF1"). Cancha e inicio dentro de las ventanas, en pasos de los minutos por partido de la categoría.
- Obligatorias: una cancha, un partido; ningún jugador superpuesto (aunque esté en dos categorías); horarios imposibles; descanso mínimo de 45 minutos por pareja; un partido de llave empieza después de que terminan los que lo definen, más el descanso; todo partido dentro de una ventana y de sus canchas.
- Deseables: nadie espera más de 3 horas entre partidos del mismo día; finales al final del último día; uso parejo de canchas.
- Algoritmo: ordena del más restringido al menos; primer horario válido; mejora por intercambios; lista lo no ubicado con motivo ("Pérez-Silva no tiene horario el sábado").
- Fijados no se mueven; "Volver a programar" reubica el resto.
- Ajuste manual: ventana con otra cancha y horario de opciones válidas; fijar o soltar.
- Publicar (`drawn` → `published`): aviso a cada pareja (`championship_fixture`); fixture visible en la página pública; opción de devolver franjas sin partidos a la grilla.

## Día del torneo

- `published` → `in_progress` al marcar el primer partido en juego o cargar un resultado. Partido: `scheduled` → `playing` → `finished` o `walkover`.
- Resultado por set, validado según la categoría: set a 6 con tie-break en 6-6 (7-6 sí, 6-5 no; 7-5 sí); tercer set súper tie-break a 10 por 2, o completo; con límite de tiempo se acepta el marcador parcial y gana quien va arriba en sets y luego en games (empate no válido). W.O. cuenta 6-0 6-0.
- Desempate de zona: partidos ganados, resultado entre ellos (si empatan dos), diferencia de sets, diferencia de games; si persiste, sorteo del organizador desde la app.
- Avance: al terminar el último partido de una zona, los clasificados entran a sus lugares de la llave; el ganador de un cruce pasa al siguiente; un *bye* avanza solo.
- Mover un partido: mismo selector de opciones válidas. Corregir un resultado: mientras el partido siguiente no tenga resultado.
- "Finalizar" cuando todas las finales están jugadas (`finished`).

## Pantallas

- **Club, `/club/torneos/campeonatos/[id]`, por pasos:** cabezas de serie y "Sortear"; zonas y llaves; "Programar" con el fixture en tabla (día, hora, cancha, categoría, partido), lo no ubicado con motivo, "Editar" y "Fijar"; "Publicar"; día del torneo con "En juego ahora" y "Próximos" ("Empezar", "Cargar resultado", "W.O."), zonas con su tabla y llaves. "Abrir modo TV" y "Compartir".
- **Público `/c/<código>`:** sin login; pestañas por categoría; zonas con tabla; llave; partidos por día con resultados; "Compartir". Se recarga cada 15 s.
- **Modo TV `/c/<código>/tv`:** pantalla completa, rota cada 20 s entre "En juego ahora", "Próximos" y cada llave; letra grande, colores del club.
- **Socio:** "Mis partidos" en Inicio y en `/campeonatos/[id]` (todas sus categorías, cancha, horario, resultado); "Compartir" en la página del campeonato.
- **Compartir:** `navigator.share` en el celular; en PC copia el link y lo confirma. Mensaje: "Seguí el {nombre} en vivo: {link}".
- En vivo dentro de la app con Realtime sobre partidos y sets.

## Tests

- **Vitest:** sorteo (zonas 3 y 4, serpentina, cabezas, llave con *byes* sin cruces de la misma zona, determinista); programador (caso del spec 8 categorías × 12 parejas, 3 días, 3 canchas: cumple las obligatorias y lista lo no ubicado con motivo; jugador en dos categorías sin superposición ni falta de descanso; fijado no se mueve); resultados (rechaza 6-5 y tie-break sin 2; acepta súper tie-break y parcial con límite); tabla de zona con desempates.
- **pgTAP:** guardar sorteo y fixture revalida y rechaza lo que rompe una obligatoria; solo staff del club; cierre de zona lleva clasificados a la llave; ganador avanza; `public_championship` solo datos públicos, nada de borradores, única función de `anon`; RLS.
- **Playwright:** el admin sortea, programa y publica una categoría chica; carga los resultados de la zona; los clasificados aparecen en la llave; la página pública muestra el resultado sin login.
- **Demo:** un campeonato jugándose hoy (sorteado y programado sobre canchas libres de la tarde, con partidos terminados, uno en juego y próximos).

## Fuera de alcance

- Recálculo de horarios en cadena por demoras y su aviso; llamado a cancha; suspensión por lluvia; "tu partido es en 30 minutos".
- Carga de resultados por jugadores y confirmación del rival.
- Arrastrar y soltar en el ajuste del fixture.
- Ranking, placa de campeones y PDF (paso 6).

## Open questions

- Ninguna bloqueante.
