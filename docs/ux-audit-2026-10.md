---
type: note
date: 2026-10-02
branch: feat/demo-logo-ux
---

# Auditoría de UX — octubre 2026

Revisión de todas las pantallas del jugador y del panel del club con los datos de demo (`npm run demo:data`), en celular (390 px, modo oscuro) y el panel también en escritorio (1280 px). Criterios: checklist de `ui-ux-pro-max` (accesibilidad, toque, layout, tipografía y color, formularios, navegación). Además de mirarlas, en cada pantalla se midieron objetivos táctiles de menos de 44 px, textos de menos de 12 px, controles sin nombre, h1 por página y scroll horizontal.

## Lo que ya está bien

- Ninguna pantalla tiene scroll horizontal de página ni textos de menos de 12 px; cada pantalla tiene un solo h1.
- Contraste: los pares de colores de los tokens tienen test (4.5:1 o más en oscuro y claro).
- Todo control tiene nombre (label, texto o aria-label). Las acciones muestran spinner y la barra de carga.
- Lo que falta en un partido se dice en palabras ("Faltan 3: 1 de drive y 2 de revés"), no solo con el dibujo.
- Estados vacíos con mensaje y acción ("No tenés reservas. Reservá una cancha").
- Sellos de day use claros (pelotas ganadas, número de la que falta, recompensa al final) y "Mi pase" con QR grande y código legible.

## Hallazgos

| # | Prioridad | Pantalla | Problema | Propuesta |
| --- | --- | --- | --- | --- |
| 1 | Alta | Club → Torneo (gestión) | En celular la página mide ~13.000 px: cada partido de las 7 rondas tiene su campo y su botón "Guardar". Recepción carga resultados con el torneo en juego, apurada. | Mostrar abierta solo la ronda en curso y plegar las otras; campo con − / + y un solo "Guardar ronda". |
| 2 | Alta | Panel del club (celular) | 7 pestañas en una fila con scroll horizontal sin indicio: Day use queda cortado y Cobros, Jugadores y Ajustes fuera de la pantalla. | Degradé o flecha en el borde, y llevar la pestaña activa a la vista; o agrupar Jugadores y Ajustes en "Más". |
| 3 | Alta | Reservar (celular) | Con 3 canchas la tercera columna queda cortada en el borde y no se ve que la grilla se desliza. | Columnas un poco más angostas para que entren 3 canchas en 390 px, o sombra o indicio de scroll. |
| 4 | Alta | Day use (jugador) | Si el day use de hoy ya terminó, la pantalla abre igual en "Hoy" con "El horario de hoy ya terminó". | Abrir en el próximo día con day use disponible. |
| 5 | Alta | Club → Day use | Solo muestra los pases de hoy: recepción no puede ver ni preparar los de mañana. | Selector de día como en la grilla. |
| 6 | Media | Varias | Objetivos táctiles chicos: "Volver a …" (20 px de alto), "Anterior" y "Siguiente" del calendario (24 px), "Mostrar" en Reservar (20 px), "Ver partido" y la fecha del próximo partido en Inicio (19–24 px). | Llevarlos a 44 px de alto (`min-h-11`) sin cambiar su aspecto. |
| 7 | Media | Inicio | "Tu próximo partido" repite la reserva de arriba; la fecha subrayada ("vie 2 20:00") no se lee como botón. | Una sola tarjeta para el partido, con "Ver partido" como botón. |
| 8 | Media | Torneo en juego (jugador) | Página muy larga (las 7 rondas completas) y el jugador no se encuentra en el ranking ni en el fixture. | Plegar rondas pasadas y futuras; resaltar "Vos" en el ranking y en tus partidos. |
| 9 | Media | Calendario | "1 fijos" (plural); los días del mes siguiente se ven apagados como si no se pudieran tocar, aunque tienen ocupación. | "1 fijo"; mismo estilo para todos los días con datos. |
| 10 | Media | Reservar | En la leyenda, el cuadrito de "Ocupada" casi no se ve (oscuro sobre oscuro). | Borde visible en el cuadrito. |
| 11 | Media | Ajustes → Logo | El input de archivo nativo dice "Choose File / No file chosen" (en inglés, según el navegador). | Botón propio "Elegir archivo" con el nombre del archivo elegido. |
| 12 | Baja | Detalle de partido | La etiqueta "Pareja 2" queda debajo de su fila; la píldora "Armándose, 1 de 4" se parte en dos líneas. | "Pareja 2" arriba de su fila; píldora sin cortes (`whitespace-nowrap`). |
| 13 | Baja | Panel del club | Todas las páginas comparten el h1 "Panel del club"; el nombre de la sección es h2. Para lectores de pantalla y para saber dónde estás, el h1 debería ser la sección. | h1 = sección (Grilla, Cobros…), y "Panel del club" como texto chico. |
| 14 | Baja | Ranking | Tabla densa; los empates muestran el mismo puesto sin aclarar. | Más aire entre filas; "Vos" resaltado (ver 8). |

Fuera de la app: el círculo "N" abajo a la izquierda es el indicador de desarrollo de Next; en producción no aparece.

## Orden sugerido

1. Antes de la demo con Rustic: 2 (pestañas), 3 (grilla), 4 (day use abre en un día disponible), 6 (objetivos táctiles) y 9 (textos del calendario). Son cambios chicos y se notan apenas abren la app.
2. Antes del piloto: 1 (carga de resultados por ronda) y 5 (day use de otros días en recepción).
3. Después: 7, 8, 10 a 14.
