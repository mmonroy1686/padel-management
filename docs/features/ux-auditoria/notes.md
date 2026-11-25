---
feature: ux-auditoria
type: note
date: 2026-11-25
branch: fix/ux-auditoria
---

# ux-auditoria: notas

Auditoría de UX/UI con `emil-design-eng` del 25/11 y los arreglos que aprobó Miguel («fix todo»).

## Qué cambió

- **Acciones destructivas.** Ahora usan siempre `variant="danger"`. Las que no se pueden deshacer y afectan datos de otros piden un segundo toque (`confirmLabel`, «¿Seguro? Tocá de nuevo»; vuelve a la etiqueta a los 3 s): cancelar reserva, rechazar transferencia, cancelar partido, quitar acceso, cancelar categoría, sacar del torneo, cancelar pase y borrar en Ajustes. Cancelar la espera propia y quitar una franja o una categoría de un campeonato que se está armando quedan en `danger`, sin el segundo toque.
- **Avisos.** Con el componente `Notice`:
  - el resultado de una acción tiene su propio estilo (borde `court-ink` y tilde), aparte de los errores, que pasan a `border-danger` con el ícono de alerta;
  - entra con una transición y se cierra con «Ocultar aviso».
- **Sheet.**
  - Entra desde abajo en 320 ms con la curva tipo iOS y sale en 200 ms. En tablet aparece centrado, creciendo desde `scale(0.96)`. Con «reducir movimiento» solo cambia la opacidad.
  - La página de atrás no scrollea mientras está abierto.
  - El cierre usa el ícono `x`.
- **Global.**
  - Curvas propias `--ease-out` y `--ease-drawer`.
  - El hover hecho a mano solo aplica con mouse (`hover: hover`).
  - Sin el destello gris al tocar.
  - `viewportFit: 'cover'`, para que los `env(safe-area-inset-*)` funcionen.
- **Menú «Acciones».** Crece desde su botón en 150 ms.
- **Grilla.** La columna de horas queda fija al scrollear de costado. Las horas pasadas usan `text-fg-muted` en vez de opacidad, porque la columna fija necesita fondo sólido.
- **Barra inferior.** La pestaña actual tiene una pastilla detrás del ícono, además del color.
- **Tira de días.** Desvanece el borde que tiene más días y frena en un día (`useEdgeFade`, compartido con las pestañas del club).
- **Detalles.** `stamp-pop` (de 0.8 a 1.05, 380 ms), el spinner a 0,75 s por vuelta y los puntos del modo TV sin `transition-all`.

## Lo que quedó afuera

- **Toasts con Sonner.** Muchos e2e buscan el aviso por `role="status"` en su lugar, y un toast agregaría un segundo `status` en la página. Por eso `Notice` queda en su lugar, con el estilo, la transición y el botón de ocultar.
- **La salida animada del sheet.** Se ve solo donde el padre pasa `open={false}`. Donde el padre desmonta el sheet (la mayoría), la entrada se anima pero la salida no.
- **Las 9 pestañas del club a barra inferior con «Más».** Es una decisión de navegación y cambia los e2e, que corren en celular. Queda para que Miguel decida.

## Un bug que apareció en el e2e

El primer toque de la confirmación ya enviaba el formulario en el navegador real. React reusaba el mismo `<button>` y le cambiaba `type` a `submit` durante el clic. Los dos botones tienen ahora `key` distinta y el primero hace `preventDefault`. jsdom no reproduce ese orden, así que lo cubren los e2e de cobros y de la grilla de recepción.

## Verificación

- Vitest 1354, lint, tsc y build.
- e2e en serie: 24 de 26 en la corrida completa. Los 2 que fallaron eran los de la confirmación; con el arreglo pasan.
