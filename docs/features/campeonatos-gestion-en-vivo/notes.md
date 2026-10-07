---
feature: campeonatos-gestion-en-vivo
type: note
date: 2026-10-07
branch: feat/campeonatos-gestion-en-vivo
---

# campeonatos-gestion-en-vivo — notes

## 2026-10-07 — Ejecución

- Las 12 tareas se aplicaron como en el plan. Las tareas 7 y 8 se commitearon sin el typecheck de la página del club (todavía no pasaba `score`/`undo` al tablero del día), que la Tarea 9 reescribe; después de la 9 todo quedó en verde.
- Al ver las capturas: los botones "+1" llevaban el nombre completo de la pareja en mayúsculas grandes y ocupaban tres renglones en el celular; pasaron a letra normal más chica (el nombre sigue completo: cada botón es único).
- Una corrida de pgTAP falló por datos que dejaron los e2e en la base local; con `db:reset` pasa completo (1120).

**Revisión de disciplina.** Sin violaciones; el servidor (staff, candado, reglas de los sets, terminar) está bien. Arreglos de pantalla, con sus tests:
- Los "+1" se ocultan cuando el partido ya está definido (sin límite de tiempo).
- Con límite de tiempo, "Terminar partido" pide confirmación ("Sí, terminar con …"): un toque de más no se puede deshacer.
- "Cargar resultado" precarga solo los sets cerrados, no el que se está jugando.

**Pendiente, de baja prioridad:** dos personas sumando games del mismo partido a la vez se suman las dos (cada "+1" es relativo). Si llegara a pasar, se puede mandar el número de game esperado y rechazar el desfasado.
