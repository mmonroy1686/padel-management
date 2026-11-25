---
feature: ux-v2
type: plan
status: in-progress
date: 2026-11-25
branch: feat/ux-v2
references: ./design.md
---

# ux-v2: plan

Seis etapas en el orden de prioridad de Miguel, cada una con su PR para que se pueda probar en localhost y mergear sola. Todas salen de `main` y siguen el flujo de siempre: tests, revisión con team-reviewer, notas y localhost antes del merge.

## Etapas

| # | Etapa | Rama | Qué incluye | Cómo se prueba | Esfuerzo (h) |
| --- | --- | --- | --- | --- | --- |
| 0 | Base visual | `feat/ux-v2-base` | `PageSection`, `RowList`/`Row`, `HeroAction`, `EmptyLine`; títulos de sección sin mayúsculas; regla de un solo `primary` | Vitest de cada componente; ninguna pantalla cambia todavía | 2 |
| 1 | Una acción principal | `feat/ux-v2-inicio` | Inicio del jugador (orden nuevo, `HeroAction`, reservas y partidos juntos, day use compacto, categoría a Perfil). Confirmación después de reservar con alias y CBU para copiar. Inicio del club («Ahora», un «Cobrar» por turno, pendientes en filas, el día en una línea). Day use del club («Vender pase» primero, «Configurar pases» a Ajustes) | Vitest de las secciones y del orden. e2e: `player-booking`, `club-home`, `day-use`, `open-match` actualizados | 8–10 |
| 2 | Navegación en el celular | `feat/ux-v2-nav` | Barra inferior del club (admin: Inicio, Grilla, Cobros, Ajustes, Más; recepción: Inicio, Grilla, Cobros, Jugadores, Más) y el sheet «Más». Encabezado en una línea. Sin «Volver» en las pantallas principales. Pestañas arriba desde 768 px | Vitest de `clubTabs` y del sheet. e2e: helper `goToClubSection` y todos los specs del club; capturas a 390 y 1024 px | 5–6 |
| 3 | Cobros | `feat/ux-v2-cobros` | «Cobrar a…» con búsqueda; «Hoy y vencidas» por defecto; un jugador por fila con sus deudas agrupadas; el mismo paso de medio que Inicio; confirmar las transferencias marcadas; «Cobrado hoy» como resumen; control segmentado | Vitest de `payments-board` (agrupar, filtro por defecto) y de la vista. e2e: `cobros-board`, `card-payments`, `reception-grid` | 8–10 |
| 4 | Deshacer y anular cobro | `feat/ux-v2-anular` | Migración `voided` (enum en su propia migración, luego columnas y la RPC `void_desk_payment`). Revisar cada suma de pagos. «Deshacer» de 10 s en el aviso y «Anular cobro» en «Cobrado hoy». `metricas.sql` con los anulados aparte | pgTAP de la RPC y de los estados de pago. Vitest de la acción y del aviso. e2e: cobrar, deshacer y ver la deuda otra vez | 5–6 |
| 5 | Grilla en el celular | `feat/ux-v2-grilla` | Una cancha por vez con control segmentado y deslizando; el tipo escrito en la celda; un indicador de pago; turnos fuera de horario en su fila; leyenda solo en pantallas grandes | Vitest de `slot-grid` en las dos vistas. e2e: `reception-grid`, `club-assistant`, `waitlist` | 6–8 |
| 6 | Formularios y textos | `feat/ux-v2-forms` | Guardado automático (`useAutoSave`) en Perfil, con «Preferencias de juego (opcional)», y en Ajustes → Club, con una sola vista previa. Los textos de la sección 6 del diseño | Vitest del hook (debounce, error, reintentar) y de los textos. e2e: `club-brand`, `day-use` (sellos), perfil | 5–6 |
| 7 | Cierre | en la última rama | `/impeccable polish` en las pantallas tocadas, `/impeccable critique` de nuevo (meta: 30/40 o más) y `/impeccable document` para `DESIGN.md` | Comparar el puntaje con 23/40; capturas antes y después en `notes.md` | 2–3 |

Total estimado: **41 a 51 horas**.

## Orden y dependencias

- La 0 va primero: todas las demás usan sus componentes.
- La 1 es la prioridad de Miguel y no depende de otras.
- La 2 toca el layout del club y muchos e2e; conviene mergearla antes de la 3 y la 5 para no pelear con conflictos en los mismos specs.
- La 4 depende de la 3 (el aviso y la sección «Cobrado hoy»).
- La 5 y la 6 son independientes entre sí.

## Criterios de aceptación

- [ ] Cada pantalla tocada tiene un solo botón lleno, y es lo primero que se ve a 390 px.
- [ ] En el celular, desde cualquier pantalla del club, Cobros y Jugadores están a un toque en la barra inferior.
- [ ] En Cobros, una recepcionista encuentra y cobra a un jugador escribiendo su nombre, sin scrollear deudas viejas.
- [ ] Un cobro en efectivo o POS se puede deshacer en los 10 s siguientes y anular durante el día; el estado de pago vuelve a pendiente.
- [ ] En el celular, la Grilla del club muestra nombres completos sin scroll horizontal.
- [ ] Perfil y Ajustes → Club se guardan solos, muestran «Guardado» o el error, y nunca guardan un valor inválido.
- [ ] La nueva crítica de impeccable da 30/40 o más.
- [ ] pgTAP, Vitest, lint, tsc, build y e2e en serie en verde en cada etapa.

## Riesgos

- **e2e:** las etapas 1, 2, 3 y 5 cambian etiquetas y navegación que los tests buscan por nombre. Cada etapa actualiza sus specs y corre la suite completa en serie antes del PR.
- **Anular cobro toca plata:** la migración sigue el patrón de `refund` y los tests cubren cada consulta que suma pagos (Cobros, Inicio, estado de pago, métricas).
- **Alcance:** si alguna etapa crece, se parte. La 3 y la 4 ya están separadas por eso.

## Revisiones del plan

- **v1 (2026-11-25):** plan inicial, después de la crítica de impeccable (23/40).
- **v2 (2026-11-25):** decisiones de Miguel: una cancha por vez, anular solo en el día, guardado automático y Ajustes en la barra del admin en lugar de Jugadores.
