---
feature: ingreso-facil
type: design
status: approved
date: 2026-11-26
branch: feat/ingreso-facil
---

# ingreso-facil — design

## Purpose

Entrar con el enlace del mail es engorroso: hay que salir de la app, abrir el mail y el enlace se abre muchas veces en otro navegador (el de Gmail, por ejemplo), donde falla con «Abrí el enlace en el mismo navegador». Miguel eligió «Las dos cosas»: Google como opción principal y un código de 6 dígitos en el mail, que se escribe sin salir de la app.

## Qué cambia

- **Ingresar**: arriba «Seguir con Google» (botón principal). Debajo, «o con tu email» y el campo de email con «Mandarme un código».
- **El código**: al mandar, la misma pantalla pide «El código de 6 dígitos» (teclado numérico, `autocomplete="one-time-code"` para que el teléfono lo sugiera). Al completar los 6 dígitos entra solo; también hay botón «Entrar». Debajo: «Mandar otro código» y «Usar otro email».
- **El enlace sigue andando**: el mail trae el código grande y el enlace abajo («o tocá este enlace»). Quien prefiera el enlace, lo usa como hoy.
- **El código no depende del navegador**: se verifica en el servidor con `verifyOtp({ email, token, type: 'email' })`, que deja la sesión en las cookies del navegador donde se escribió. Se termina el error de «otro navegador» para quien usa el código.
- **Después de entrar**: igual que con el enlace (`landingAfterSignIn`): el staff va al panel, el jugador a donde iba.

## Sesión larga

No hace falta cambiar nada: Supabase no vence los refresh tokens (salvo que se active «Time-box» o «Inactivity timeout», que en producción deben quedar apagados) y `@supabase/ssr` guarda las cookies 400 días; `proxy.ts` refresca la sesión en cada visita. Se anota como chequeo para producción.

## Plantillas de mail

Supabase manda el mail. Hoy usa la plantilla por defecto (solo el enlace). Se versionan dos plantillas en `supabase/templates/` (Magic Link y Confirm signup: el primer ingreso de un email nuevo puede usar la segunda) con `{{ .Token }}` y `{{ .ConfirmationURL }}`, en castellano. Local las toma de `config.toml`; en producción Miguel las pega en Supabase → Authentication → Email Templates. Mientras no estén pegadas, el mail trae solo el enlace: por eso la pantalla dice «Escribí el código del mail o tocá el enlace».

## Errores

- Código incorrecto o vencido (`otp_expired`, `invalid_credentials`): «El código no es correcto o venció. Revisalo o pedí otro.»
- Demasiados intentos (`over_request_rate_limit`): «Probaste muchas veces. Esperá unos minutos y pedí otro código.»
- Formato: si no son 6 dígitos, «Son 6 números.» sin llamar a Supabase.
- El detalle va al log del servidor solo con `status` y `code` (nunca el email).

## Fuera de alcance

Contraseñas, Apple, WhatsApp/SMS. Pedir otro código anula el anterior (comportamiento de Supabase).
