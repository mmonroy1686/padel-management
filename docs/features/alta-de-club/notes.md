---
feature: alta-de-club
type: note
date: 2026-11-24
branch: feat/alta-de-club
---

# alta-de-club — notas

## `PLATFORM_HOST` en lugar del dominio raíz

El handoff ponía el panel en `<ROOT_DOMAIN>/plataforma`, pero todavía no hay dominio. `PLATFORM_HOST` dice en qué host
se abre: hoy la URL de Vercel, después el dominio raíz. Sin la variable, o en otro host, `/plataforma` da 404, así que
no aparece en el subdominio de un club. Ese host hoy es también el del club por defecto: el ingreso se ve con la marca
de Rustic.

## Sin dominio no se crean clubes

La revisión de disciplina lo encontró. Sin `NEXT_PUBLIC_ROOT_DOMAIN`, fuera de localhost todo host es el club por
defecto: un club creado no tendría dirección propia, y el mail de invitación mandaría al admin al `/invitacion` de
Rustic, donde falla. Mientras no haya dominio, `/plataforma` lo explica en lugar del formulario y `createClub` lo
rechaza. En local funciona con `<slug>.localhost:3000`.

## Los clubes que ya existían, terminados

`setup_completed_at` se llena en la migración con la fecha de alta de cada club, y la seed marca a Rustic y a Norte.
Sin eso, el admin de Rustic habría caído en el asistente al mergear.

## Cuándo aparece el asistente

El panel manda al admin al asistente cuando el club no terminó el alta **y no tiene canchas**. Una vez que hay canchas,
el Inicio muestra «Terminá de configurar el club» en lugar de redirigir, así «Terminar después» no vuelve a meterlo en
el asistente. «Terminar después» desde un club sin canchas usa `?alta=despues`.

## Menos saltos al aceptar

Aceptar una invitación pasaba por `/club` → `/club/inicio` → `/club/alta` → `/club/alta/canchas`, y el router del
cliente se quedaba a mitad de camino (lo encontró el e2e). Ahora aceptar va directo a `/club/inicio`, y el Inicio
redirige directo al paso que falta.

## Los formularios de Ajustes, compartidos

`app/(club)/club/ajustes/forms.tsx` tiene los formularios de reglas, cobros, canchas, precios e invitación. Las
páginas de Ajustes y los pasos del asistente usan los mismos. Logo y colores ya eran componentes.

## Fuera de alcance, para después

- «Terminar después» dura una visita (`?alta=despues`): si el club no tiene canchas, volver a Inicio lleva otra vez al
  asistente. Con una cancha cargada ya no redirige.
- La regla del slug está en la base (`private.checked_slug`), en `lib/domain/platform.ts` y, más laxa, en
  `lib/club/host.ts`.

- Dar de baja o editar un club desde la plataforma.
- El paso de cobros todavía no tiene POS: lo suma el corte 4.
