---
feature: ingreso-facil
type: note
date: 2026-11-26
branch: feat/ingreso-facil
---

# ingreso-facil — notes

- El código se verifica en el servidor (`verifyOtp`, `type: 'email'`): la sesión queda en las cookies del navegador donde se escribió. Por eso el código esquiva el error de «otro navegador» del enlace (PKCE).
- El mismo mail trae código y enlace: `{{ .Token }}` y `{{ .ConfirmationURL }}`. Las plantillas son una para todo el proyecto (no por club), así que van en negro, sin el color del club.
- Un email nuevo puede recibir la plantilla «Confirm signup» en vez de «Magic Link»: por eso se versionan las dos con el mismo contenido.
- `roleInClub` pasó a `lib/auth/role-in-club.ts`: lo usan el callback y la acción del código.
- Local: las plantillas se cargan al arrancar Supabase (`supabase stop` + `start`, sin reset).
- e2e: `signInWithCode` saca el código del elemento `id="sign-in-code"` del mail en Mailpit. `signInWithMagicLink` sigue siguiendo el enlace.

## Producción (Miguel)

1. Supabase → Authentication → Email Templates → **Magic Link**: asunto «Tu código para entrar», pegar `supabase/templates/magic_link.html`.
2. Lo mismo en **Confirm signup** con `supabase/templates/confirmation.html`.
3. Authentication → Sessions: «Time-box user sessions» e «Inactivity timeout» apagados (así la sesión no vence).
4. Google: Authentication → Providers → Google habilitado con su Client ID y Secret, y la URL de callback de Supabase cargada en Google Cloud.
