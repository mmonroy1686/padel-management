---
feature: ux-v2
type: design
status: approved
date: 2026-11-25
branch: feat/ux-v2
references: impeccable critique del 25/11 (23/40)
---

# ux-v2: diseño

## Para qué

La crítica de impeccable del 25/11 dio **23/40** (aceptable). Miguel siente que la app «no es user friendly», y la crítica dice por qué:

- todas las pantallas pesan lo mismo y no se ve qué hacer;
- en el celular, la navegación del club esconde Cobros y Jugadores;
- Cobros es una pared de botones que cobran con un toque y no se pueden deshacer;
- la Grilla no entra en un teléfono;
- los formularios guardan por partes.

Este corte ataca los 5 problemas en el orden que eligió Miguel. Empieza por **una acción principal por pantalla**, con un tono de **más calma y aire**.

Lo que se ve cambia. Lo que la app hace queda igual: mismas funciones, mismos textos de reglas y mismas reglas de negocio. La única pieza nueva de datos es **anular un cobro**.

## Principios

- **Una acción principal por pantalla, y primero.** Lo que más se hace en esa pantalla va arriba y como bloque grande; el resto queda subordinado o detrás de «Más».
- **Calma y aire.** La jerarquía sale del tamaño, el peso y el espacio, no de encerrar todo en tarjetas. Las mayúsculas condensadas quedan solo para el título de la pantalla.
- **El celular manda.** Recepción y jugadores usan el teléfono. La tablet y la computadora mantienen lo que ya funciona (pestañas arriba, grilla completa).
- **Nada sin red.** Lo que mueve plata se puede deshacer, y lo destructivo pide confirmación, como en la auditoría anterior.
- **Los tests acompañan.** Los e2e corren en un celular (Pixel 7). Cada cambio de navegación o de etiquetas actualiza sus tests en el mismo corte.

## Lenguaje visual: «calma y aire»

Se aplica a todas las pantallas que toca el corte. Va en componentes compartidos para que no quede a mano en cada una.

| Hoy | Después |
| --- | --- |
| Cada sección es una `Card` con título `font-display text-2xl uppercase` | **Título de pantalla**: el único en mayúsculas condensadas. **Título de sección**: `text-lg font-semibold`, normal, con espacio arriba (`mt-8`) en vez de borde. |
| Listas como pilas de tarjetas (Jugadores, Pendientes) | Filas con divisor (`divide-y`): nombre y dato principal a la izquierda, acción o chevron a la derecha. Tarjeta solo donde agrupa algo que se toca entero (una reserva, un partido). |
| Recuadros de números aunque valgan 0 | Un número solo aparece si informa: los ceros se ocultan, o quedan como una línea gris («Hoy no hay pases vendidos»). |
| Varios botones ámbar llenos en la misma pantalla | **Un solo** botón lleno (`primary`) por pantalla. El resto, `secondary` (borde) o link. |
| Secciones vacías con su tarjeta y su texto | Una línea gris: «No tenés partidos esta semana». |

Componentes nuevos o cambiados:
- `PageSection` (título y contenido, sin tarjeta).
- `RowList` / `Row` (filas con divisor).
- `HeroAction`: el bloque grande de la acción principal, con título, dato y flecha, y toda el área tocable.
- `EmptyLine`.
- `Card` sigue existiendo, pero para menos cosas.

Al terminar, `/impeccable document` deja esto escrito en `DESIGN.md`.

## 1. Una acción principal por pantalla

### Inicio del jugador (`app/(jugador)/page.tsx`)

Orden nuevo:
1. **`HeroAction` «Reservar cancha»**, con el dato «10 turnos libres hoy» (o «Mañana desde las 08:00» si hoy no queda nada), y va a /reservar.
2. **Tus reservas y partidos**, juntos, ordenados por fecha. Cada uno muestra lo que falta hacer, por ejemplo «Falta pagar: transferí a [alias]». Si no hay nada: una línea con link a Reservar.
3. **Para vos**: los partidos abiertos a los que puede sumarse. Hasta 3, con «Ver todos».
4. **Day use y sellos**, en una línea compacta («Day use hoy, $300 · 3/5 sellos») que lleva a /day-use. Ya no es una tarjeta grande arriba de todo.
5. **El club** (la sección de Datos del club), como hoy, al final.

Se sacan de arriba la categoría («5.ª categoría, validada. Revés»), que pasa a Perfil, y los avisos repetidos.

**Después de reservar** aparece una confirmación clara en el lugar del aviso chico: cancha, día y hora, cómo pagar (si es por transferencia, el alias y el CBU del club con un botón para copiarlo) y «Ver mis reservas».

### Inicio del club (`app/(club)/club/inicio/page.tsx`)

- **Arriba: «Ahora»**, los turnos en cancha y el próximo. Cada turno tiene **un solo** «Cobrar», que abre el paso del medio con los jugadores. Ya no hay un botón por jugador más «Cobrar todo» a la vista.
- **Transferencias por confirmar**: una línea con el número que lleva a Cobros, no una tarjeta.
- **Pendientes de cobro**: filas (nombre completo, turno y monto) que no se truncan. Hasta 5, con «Ver en Cobros».
- **El día**: ocupación e ingresos en una línea. Sin recuadros.

### Day use del club (`app/(club)/club/day-use/page.tsx`)

- La acción principal es **«Vender pase»**, arriba.
- Debajo, los pases de hoy en filas.
- Los números (vendidos, ingresos, recompensas) en una línea, y solo si hay movimiento.
- «Configurar pases» se va a Ajustes, a una sección nueva «Day use».

## 2. Navegación del club en el celular

- **En el celular (menos de 768 px), una barra inferior** con 5 lugares. **Admin:** Inicio, Grilla, Cobros, Ajustes y Más. **Recepción:** Inicio, Grilla, Cobros, Jugadores y Más.
- **«Más»** abre un sheet con Asistente, Calendario, Torneos, Day use y, si es admin, Jugadores, cada uno con su ícono y una línea que dice para qué es.
- **Desde 768 px** siguen las pestañas de arriba con todas las secciones, como hoy.
- **Encabezado del club, en una sola línea:** el logo y el título de la sección. «Panel del club · Rustic Pádel» se saca (el logo ya lo dice), «Ir a la app» pasa al sheet «Más», y «Volver» no aparece en las pantallas principales.
- La barra inferior reutiliza el `TabNav` (`variant="bottom"`) del jugador, con la pastilla en la sección actual.

**Tests:** los e2e que hoy tocan pestañas del club por nombre siguen funcionando para las 4 de la barra. Para las de «Más», un helper `goToClubSection(page, 'Torneos')` abre el sheet y toca la sección.

## 3. Cobros

### Lo que se ve (`app/(club)/club/cobros/*`, `lib/domain/payments-board.ts`)

- **Arriba: «Cobrar a…»**, con la búsqueda grande y en foco. La recepcionista con fila escribe el nombre y le cobra.
- **Por defecto, «Hoy y vencidas»:**
  - lo de hoy en filas;
  - lo de días anteriores **agrupado por jugador** («Sofía Cabrera · 2 deudas · $3.200», que se despliega).
  - «Ver todo» muestra el resto.
- **Un jugador, una fila.** Nicolás Rodríguez no aparece 3 veces: aparece una vez con sus turnos adentro.
- **Cobrar** abre el mismo paso de medio que en Inicio (efectivo, transferencia o POS, según lo que acepte el club). Así, en toda la app se cobra con el mismo gesto.
- **Transferencias por confirmar:**
  - van como su propia sección, con la más vieja primero;
  - cada una se confirma por separado, pero se puede **«Confirmar las marcadas»** después de tildar varias;
  - rechazar sigue pidiendo motivo y confirmación.
- **«Cobrado hoy»:** una línea de resumen («$159.800 en efectivo · $300 transferencia · $0 POS») que se despliega a la lista.
- Los botones de vista («Cobrar 68 / Devolver») pasan a ser un **control segmentado** (`role="tablist"`), no un botón principal.

### Deshacer y anular

- Después de cada cobro, el aviso dice «Cobramos $1.200 en efectivo a Nicolás» con un botón **«Deshacer»** durante 10 segundos.
- En «Cobrado hoy», cada fila tiene **«Anular cobro»**, con confirmación de dos toques, mientras sea del mismo día.

**Datos (migración nueva):**
- `payment_status` suma el valor `voided`, en su propia migración (un valor de enum nuevo no se puede usar en la misma transacción). Columnas nuevas `voided_at` y `voided_by`.
- La RPC `void_desk_payment(p_payment_id)`:
  - la usa el staff del club;
  - solo sirve para pagos `confirmed` en efectivo o POS, confirmados **hoy** en la zona horaria del club; un error da `invalid_state`;
  - las transferencias se manejan con rechazar o devolver, como hoy.
- Un pago anulado no cuenta para el estado de pago ni para los cobros del día. Hay que revisar cada consulta que suma pagos confirmados, aunque la mayoría filtra por `status = 'confirmed'` y ya lo excluye.
- `docs/piloto/metricas.sql` (consulta 6) muestra los anulados aparte.
- pgTAP: staff sí, jugador no, otro club no, transferencia no, día anterior no, y el estado de pago vuelve a «pendiente».

## 4. La Grilla en el celular

- **En el celular, la grilla del club muestra una cancha por vez**, con un control segmentado arriba («Cancha 1 · Cancha 2 · Cancha 3») y deslizando de costado entre canchas. Cada celda tiene el ancho completo: entran el nombre entero, el tipo y el pago.
- **El tipo va escrito dentro de la celda** («Turno fijo», «Bloqueo: clase de Pablo»), además del color. La leyenda de 7 entradas queda solo en tablet y computadora.
- **Un solo indicador de pago** por celda: un punto con texto («Pagada» o «Debe $900»). El detalle queda en el sheet.
- **Los turnos fuera de horario** van como una fila más, en su hora, marcados «fuera de horario». Ya no hay un bloque «Fuera de la grilla» aparte.
- La grilla del jugador ya entra en 3 columnas y no cambia, salvo por el texto del tipo.

## 5. Formularios que se guardan solos

Decisión de Miguel: guardado automático, sin botones «Guardar».

- **Cómo se comporta:**
  - las casillas, los interruptores y los selectores se guardan al tocarlos;
  - los campos de texto se guardan al salir del campo (`blur`) o 800 ms después de dejar de escribir;
  - al lado de cada grupo aparece «Guardando…», después «Guardado» con un tilde que se va a los 2 s, o el error en rojo con «Reintentar»;
  - si el valor no pasa la validación, no se guarda: se muestra el error junto al campo y el valor anterior sigue en la base.
- **Perfil del jugador:**
  - nombre, teléfono, categoría, lado, horarios y canchas preferidas se guardan solos;
  - horarios y canchas preferidas van detrás de «Preferencias de juego (opcional)», cerrado por defecto.
- **Ajustes → Club:**
  - nombre, WhatsApp y marca se guardan solos;
  - el logo y el fondo del flyer siguen guardándose al subirlos;
  - una sola vista previa (la del modo actual) con un selector oscuro/claro, en vez de dos grandes.
- **Las otras secciones de Ajustes** (reservas, pagos, sellos) quedan con su «Guardar»: cambian reglas que se aplican juntas y conviene confirmarlas a propósito.
- **Técnico:**
  - un hook `useAutoSave(action, { debounce })` sobre las mismas Server Actions de hoy, que se llaman por campo o por grupo;
  - las acciones ya validan y devuelven `ActionState`, así que no cambian las reglas.

## 6. Textos (`/impeccable clarify`)

- «Donde puedo sumarme» pasa a «Dónde puedo sumarme».
- «Asistente» queda como nombre, con su línea en «Más»: «Huecos libres y flyer para WhatsApp».
- «Fuera de la grilla» se saca (punto 4).
- «-100 %» pasa a «Gratis (recompensa)».
- El aviso «No quedan canchas libres, el partido se cae» aparece una sola vez arriba de la lista de partidos, no en cada tarjeta.
- Después de pedir el enlace: «Si no llega en un minuto, mirá en spam o promociones».

## Fuera de alcance

- La portada sin sesión con canchas y precios: eso es la landing del corte E del handoff.
- Ayuda o recorrido para recepción nueva.
- Atajos de teclado.
- Cambiar marca, paleta o fuentes: el tono «calma y aire» es de jerarquía y espacio, no de identidad.

## Decisiones de Miguel (25/11)

1. Grilla en el celular: una cancha por vez, con pestañas.
2. Anular cobro: solo los del mismo día, en efectivo o POS.
3. Perfil y Ajustes → Club: guardado automático de cada campo, no un «Guardar» fijo.
4. Barra del club en el celular: el admin ve Inicio, Grilla, Cobros, Ajustes y Más (Jugadores pasa a «Más»); recepción, que no tiene Ajustes, ve Inicio, Grilla, Cobros, Jugadores y Más.
