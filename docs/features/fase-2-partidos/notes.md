---
feature: fase-2-partidos
type: note
date: 2026-09-29
branch: feat/fase-2-partidos
---

# fase-2-partidos — notes

- 2026-09-29: rama creada desde `main` después del merge de la fase 1 (PR #2). En ese momento producción todavía no tenía `20260929000850`, `000860` y `000900` (pendiente de `migrate.yml` o `db push` manual).
- 2026-09-29 (Task 7): `npm test` falló de forma intermitente por el timeout de 5 s de Vitest (primero el test nuevo de `AvailabilityForm`, después `SlotGrid` de la fase 1) con todos los archivos jsdom en paralelo y la máquina cargada. Se agregó `testTimeout: 15_000` en `vitest.config.mts`; no cambió ninguna aserción. Con eso, 4 corridas seguidas en verde (256 tests).
- 2026-09-29 (Task 7): `npm run test:e2e` local con los workers por defecto falló en 3 de 4 corridas completas, en `reception-grid` (y una vez en `player-booking`), cada vez en un paso distinto y al llegar al timeout de 30 s del test: el `next dev` compila las rutas bajo carga. Cada spec pasa sola, y con `--workers=1` pasaron las 4 en dos corridas seguidas. No se tocó `playwright.config.ts` (en CI corre sobre `npm run start` con 1 reintento); queda para revisar si también falla en CI.
- 2026-09-29 (Task 8): en `create_match.test.sql` el caso `slot_taken` usaba el día 4 a las 10:00, que no cae en la grilla del club T (08:00 cada 90 min: 09:30, 11:00…), así que `create_match` fallaba antes con `not_aligned`. Se pasó la reserva y el intento al día 4 a las 11:00; la aserción no cambió.
