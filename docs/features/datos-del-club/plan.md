---
feature: datos-del-club
type: plan
status: in-progress
date: 2026-11-24
branch: feat/datos-del-club
references: ./design.md
---

# datos-del-club — plan

## Orden

| # | paso | sale | se prueba con |
|---|---|---|---|
| 1 | Migración `20261128000100_club_info.sql`: columnas de `clubs` con sus checks, tabla `club_photos` (RLS: lectura pública, escritura por RPC), RPC `save_club_info`, `add_club_photo`, `remove_club_photo` (devuelve el path para borrar el archivo), `move_club_photo`. Tipos regenerados. | base | pgTAP `club_info.test.sql` |
| 2 | Dominio `lib/domain/club-info.ts`: servicios (clave → texto), coordenadas de un link de Google, link de Google válido, «Cómo llegar», WhatsApp (`wa.me` con código de país según la zona horaria), Instagram, parser del formulario, qué partes de «El club» se muestran. Paths de fotos en `club-logo.ts`. Mensajes de error nuevos. | lógica pura | Vitest |
| 3 | `lib/storage/club-photo.ts`: el navegador achica a 1600 px y pasa a JPG; sube a `club-logos/<club>/photo-<ts>.jpg`. | subida | Vitest (validación) |
| 4 | Mapa: `leaflet` 1.9.4 + `react-leaflet` 5.0.0. `ClubMap` (modos `edit` y `view`, pin con `divIcon` para no depender de las imágenes de Leaflet), cargado con `next/dynamic` sin SSR. Búsqueda en Nominatim, un pedido por clic. | componente | Vitest (lo que no es Leaflet) + e2e |
| 5 | Ajustes → «Datos del club» (`/club/ajustes/datos`): sección en el menú, página, acciones (`saveClubInfo`, `addClubPhoto`, `removeClubPhoto`, `moveClubPhoto`), `ClubInfoForm` y `ClubPhotosForm`. | pantalla admin | Vitest de componentes y acciones |
| 6 | Inicio → «El club»: `loadClubPhotos`, `ClubSection` al final de Inicio y de la portada; mapa chico que se carga al acercarse (IntersectionObserver). | pantalla jugador | Vitest + e2e |
| 7 | e2e `club-info.spec.ts` (Pádel Norte, para no tocar Rustic), README, notes. | cierre | e2e, build, lint, tsc |

## Decisiones del plan

- Las columnas tienen sus checks (la base tiene la última palabra aunque se actualice `clubs` directo); la RPC da el
  error con nombre. Los servicios se guardan sin repetir y ordenados por la RPC; el check solo pide que sean de la lista.
- Las fotos se escriben solo por RPC: así el máximo de 8 y el orden no se rompen con dos pestañas abiertas
  (`for update` sobre el club).
- Los chips de servicios usan el ícono `check` que ya existe: sumar nueve íconos nuevos no cambia qué entiende el
  jugador.
- WhatsApp: el teléfono se guarda local (`092369558`); para `wa.me` se cambia el 0 inicial por el código del país de la
  zona horaria del club (Uruguay 598, Argentina 54, Paraguay 595, Chile 56, Brasil 55).

## Criterios de aceptación

- [ ] El admin carga dirección, pin (tocando, arrastrando o pegando un link de Google con coordenadas), WhatsApp,
      Instagram, email, servicios y hasta 8 fotos; las puede quitar y reordenar.
- [ ] El jugador (con o sin sesión) ve «El club» al final de Inicio solo con lo cargado; WhatsApp abre `wa.me`.
- [ ] Si el club no cargó nada, la sección no aparece.
- [ ] pgTAP, Vitest, e2e, lint, tsc y build en verde.

## Revisiones

- **v1 (2026-11-24)**: plan inicial.
