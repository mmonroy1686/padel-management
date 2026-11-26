---
feature: ingreso-facil
type: plan
status: done
date: 2026-11-26
branch: feat/ingreso-facil
references: ./design.md
---

# ingreso-facil — implementation plan

## Build sequence

| # | step | output | testable how |
|---|---|---|---|
| 1 | Plantillas | `supabase/templates/magic_link.html` y `confirmation.html` (código grande + enlace), registradas en `config.toml` con asunto en castellano | Mailpit local |
| 2 | Dominio | `lib/auth/sign-in-code.ts`: `parseSignInCode` (6 dígitos, tolera espacios) y `signInCodeErrorMessage(code)` | Vitest |
| 3 | Acciones | `sendMagicLink` devuelve el email enviado; nueva `verifySignInCode` (verifyOtp + destino con `landingAfterSignIn`). `roleInClub` pasa a `lib/auth/role-in-club.ts` y lo usan el callback y la acción | Vitest de acciones y ruta |
| 4 | Pantalla | Google arriba como principal; «o con tu email»; tras mandar, el formulario del código (entra solo al completar 6 dígitos), «Mandar otro código», «Usar otro email» | Vitest de componentes |
| 5 | e2e y docs | Soporte e2e con los nuevos textos; `signInWithCode` y un spec que entra con el código; notes.md | Playwright |

## Acceptance criteria

- [x] Google es el primer botón de Ingresar.
- [x] Con el código de 6 dígitos del mail se entra sin abrir el enlace, y el staff cae en el panel.
- [x] El enlace del mail sigue funcionando.
- [x] Código malo o vencido da un mensaje claro y deja reintentar.
- [x] Pasan Vitest, Playwright y el build.

## Plan revisions

(append-only)

- **v1 (2026-11-26)**: initial plan.
