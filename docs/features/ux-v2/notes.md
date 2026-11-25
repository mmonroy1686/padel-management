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

## Etapa 2: navegación del club en el celular (25/11)

- **Barra inferior, solo en el celular** (`components/nav/club-bottom-nav.tsx`, `md:hidden`):
  - admin: Inicio, Grilla, Cobros, Ajustes y Más;
  - recepción: Inicio, Grilla, Cobros, Jugadores y Más;
  - la sección actual lleva la pastilla, igual que la barra del jugador;
  - «Más» se marca cuando estás en una sección que vive ahí.
- **La hoja «Más»** tiene:
  - Asistente, Calendario, Torneos, Day use y (si sos admin) Jugadores, cada una con una línea de para qué sirve;
  - «Ir a la app de jugadores».
  - Se cierra sola al navegar, porque queda atada a la dirección donde se abrió (sin efecto que cambie estado).
- **Datos** (`lib/club/tabs.ts`): `clubBarTabs` y `clubMoreTabs` arman, según el rol, la barra y «Más» a partir de la misma lista `clubTabs`.
- **Encabezado en el celular:** logo y nombre de la sección en una línea. «Panel del club · nombre», «Volver» e «Ir a la app» se ven desde tablet.
- **Pestañas de arriba:** se ven solo desde 768 px.
- El contenido deja 7rem abajo en el celular para la barra.
- Ícono nuevo `more`.

**Verificación:**
- Vitest: `club-bottom-nav.test.tsx` y `tabs.test.ts` (la barra y «Más» por rol).
- e2e completo en serie: 25 de 26. Falló `multi-club` al pedir el enlace de ingreso, y repetido solo pasa. No hizo falta cambiar ningún e2e: los que navegan por el panel usan Cobros y Grilla, que están en la barra.

## Etapa 3: Cobros (25/11)

- **La búsqueda va primero, más grande** («Cobrar a… (nombre o cancha)»). Le siguen el resumen, con números más chicos y sin tarjetas, y los carriles.
- **Carriles:** Cobrar y Devolver pasan a un control segmentado (fondo `bg-bg` en el elegido), no a un botón ámbar lleno que parecía «cobrarles a 68».
- **Sin cobrar:**
  - lo de hoy, en filas;
  - «De días anteriores»: un jugador con varias deudas viejas es **un grupo** («Valentina López · 5 deudas · $2.200») que se despliega; uno con una sola queda como fila. Lo arma `splitDebts` en `lib/domain/payments-board.ts`;
  - si buscás, todo aparece en filas sueltas.
- **Cobrar:** el mismo paso de elegir medio que en Inicio (`ChargeChoice`: Efectivo o POS, según lo que acepte el club). El botón dice «Cobrar» y su nombre accesible «Cobrar $1.200 a Paula». Al cobrar, arriba aparece «Cobramos $1.200 en efectivo a Paula.».
- **Por confirmar:**
  - cada transferencia tiene una casilla, y «Confirmar las marcadas (N)» las confirma juntas con la acción nueva `confirmPayments` (`confirm_payment` una por una);
  - si una ya no estaba por confirmar, sigue con las demás y lo dice;
  - «Revisar» sigue abriendo el sheet con el comprobante.
- **Cobrado, rechazado y devuelto hoy:** se ven los últimos 5, y «Ver los N» muestra el resto.
- **Las filas** muestran el nombre completo, sin truncar.
- **Resultado:** la página pasó de unos 39.500 px a unos 10.000 px con los datos demo.

**Lo que queda para la etapa 4:** «Deshacer» después de cobrar y «Anular cobro», que necesitan la migración.

**Verificación:**
- Vitest:
  - `splitDebts`;
  - el tablero: grupos y confirmar las marcadas;
  - `confirmPayments`: todas, una que ya no estaba, y entrada inválida.
- e2e: `cobros-board` y `card-payments` usan el paso nuevo de elegir medio. Pasan cobros, POS, la grilla de recepción y el Inicio del club.
- Vitest 1372, lint, tsc y build.

## Etapa 4: deshacer y anular un cobro (25/11)

- **Migraciones:**
  - `20261130000100_payment_voided_status.sql`: el valor `voided` de `payment_status`, solo en su migración, porque un valor de enum nuevo no se puede usar en la misma transacción.
  - `20261130000110_void_desk_payment.sql`:
    - columnas `voided_at` y `voided_by`;
    - el check de efectivo acepta `voided`, y un check nuevo exige `voided_at` cuando el estado es `voided`;
    - la RPC `void_desk_payment`: solo staff del club, solo efectivo o POS confirmado **hoy** en la zona horaria del club (decisión de Miguel). Si no, `invalid_state`.
- **Por qué alcanza con eso:** todo lo que suma lo pagado (reservas, partidos, torneos, campeonatos, day use) cuenta `status = 'confirmed'`, así que un pago anulado vuelve a dejar la deuda sin tocar ninguna otra función. Cobros tampoco lo carga como «cobrado hoy».
- **Cobros:**
  - en «Cobrado hoy», cada cobro en efectivo o POS tiene «Anular», en rojo y con confirmación en dos toques;
  - después de cobrar, junto al aviso aparece «Deshacer» durante 10 segundos. Busca en «Cobrado hoy» el cobro recién hecho (mismo jugador y monto, del último minuto) y lo anula.
- **`metricas.sql`:** la consulta 6 suma la columna `anulados`.

**Verificación:**
- pgTAP `void_desk_payment.test.sql` (12): el check, jugador y otro club no, recepción sí, queda con quién y cuándo, deja de contar como pagado, no dos veces, no de otro día, no una transferencia, `not_found`, escritura directa (42501) y anon.
- Vitest: anular en el tablero y la acción `voidPayment`.
- e2e: `cobros-board` cobra, toca «Deshacer», ve la deuda de nuevo y vuelve a cobrar.
- Completo con la base reseteada: pgTAP 1429, Vitest 1375, lint, tsc, build y e2e 26 de 26.

## Etapa 5: la Grilla en el celular (25/11)

- **Una cancha por vez en el celular:** un control segmentado («Cancha 1 · Cancha 2 · Cancha 3») arriba de la grilla elige cuál se ve. Las otras columnas se ocultan con `hidden md:table-cell`, así que desde tablet la grilla sigue completa, sin JS de por medio. Las celdas ocupan todo el ancho y el nombre entra entero (hasta 2 líneas).
- **El tipo ya iba escrito en cada celda** («Reserva, en recepción», «Torneo», «Turno fijo») junto con el pago. La leyenda de 7 entradas se ve solo desde tablet.
- **«Fuera de la grilla» pasa a «Fuera de horario»**, en la celda y en la lista del tablero.
- La grilla del jugador no cambia: ya entra en 3 columnas.

**Desvíos del diseño:**
- No hay deslizar de costado entre canchas: con el control segmentado alcanza, y deslizar choca con el scroll de la página.
- Los turnos fuera de horario siguen en su lista abajo, con el nombre nuevo, en vez de una fila más en su hora: moverlos a la grilla cambia `buildDayGrid` y su cálculo de filas, y no era lo que hacía difícil la pantalla.

**Tests:**
- Vitest: el selector de cancha en el celular, y que el jugador no lo tiene.
- e2e: `tests/e2e/support/grid.ts` con `showCourt` (cancha conocida) y `revealInGrid` (busca la celda cancha por cancha). Lo usan `reception-grid`, `club-home` y `open-match`, y el primer turno libre se elige entre los visibles. Pasan la grilla de recepción, el Inicio del club, partido abierto y marca.
- Vitest 1377, lint, tsc y build.
