---
feature: ux-v2
type: note
date: 2026-11-25
branch: feat/ux-v2
---

# ux-v2: notas

## Etapas 0 y 1: base visual y una acción principal (25/11)

Van en la misma rama que el diseño (`feat/ux-v2`), en vez de en dos ramas separadas: la base visual sola no cambiaba ninguna pantalla y no tenía nada que probar.

### Base visual (`components/ui/`)

- `PageSection`: título de sección (`text-lg font-semibold`, sin mayúsculas) con un «Ver todos» opcional. `EmptyLine` para lo vacío.
- `RowList` / `RowLink`: filas con divisor, cada una un link entero con ícono, título, detalle y chevron.
- `HeroAction`: el bloque grande de la acción principal; todo el bloque es el link.
- `chevron-right` en el set de íconos.
- El título y el detalle se separan con una coma solo para lectores de pantalla («Reservar cancha, 10 turnos libres hoy»): sin ella, el nombre accesible quedaba pegado.

### Inicio del jugador

- Orden nuevo:
  1. «Hola, X»;
  2. **«Reservar cancha»** como `HeroAction`, con los turnos libres de hoy;
  3. Tus reservas, que trae también las esperas;
  4. Tus partidos: los abiertos en filas y los del campeonato. Solo aparece si hay alguno;
  5. Partidos para vos: hasta 3, con «Ver todos» si hay más;
  6. Day use, sin tarjeta y con una fila al pase o a comprarlo;
  7. torneos en una fila.
- La categoría y el lado salen del Inicio: ya están en Perfil.
- El único botón lleno de la pantalla es «Reservar cancha». «Tu pase de hoy» dejó de ser un botón lleno.

### Después de reservar (`components/booking/booking-next-steps.tsx`)

Debajo del aviso aparecen:
- cómo se paga;
- si el club acepta transferencia, sus datos con «Copiar datos»;
- «Ver tu reserva en Inicio».

Aparece solo después de reservar o de armar un partido, no después de anotarse a una espera.

### Inicio del club

- Los títulos de sección pasan a `text-lg font-semibold`, y la cancha de cada turno también.
- **Un «Cobrar» por turno**: el turno muestra «Cobrar ($1.200)», y al tocarlo aparecen el cobro por jugador y «Cobrar todo lo que falta» (ahora `secondary`). Una fila de Pendientes que se abrió para cobrar ya muestra los cobros abiertos (`chargesOpen`). La Grilla no cambia: en su sheet los cobros se ven de entrada.
- «Pendientes de cobro» pasa a filas con divisor: el nombre completo, sin truncar, y abajo la cancha, la hora y lo que debe.
- «El día» (ocupación, avisos y cancelaciones) deja las tarjetas por secciones con una línea arriba.
- Transferencias por confirmar: borde normal y «Revisar» como `secondary`.

### Day use del club

- «Vender pase» va primero y a todo el ancho.
- Los tres recuadros de números pasan a una línea que solo aparece si algo se movió («$600 cobrados hoy · 2 adentro»).
- «Configurar pases y horarios» queda como un link al final, solo para el admin.

**Desvío del diseño:** el diseño decía mover «Configurar pases» a Ajustes. Lo dejé en su ruta (`/club/day-use/configuracion`), con un link al pie, porque Ajustes resalta su sección por la ruta y una entrada que lleva fuera de `/club/ajustes` quedaba sin resaltar. Se puede mover la página adentro de Ajustes en la etapa 6.

### Tests

- Vitest:
  - `page-blocks.test.tsx`: `HeroAction`, `PageSection`, `RowList` y `BookingNextSteps`, con el copiado;
  - `turn-court.test.tsx`: el «Cobrar» único que abre los cobros.
- e2e: `club-home` abre el «Cobrar» del turno antes de cobrar.

### Verificación

- Vitest 1360, lint, tsc y build.
- e2e en serie con la base reseteada: 26 de 26.
