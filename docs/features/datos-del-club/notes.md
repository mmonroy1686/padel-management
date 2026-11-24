---
feature: datos-del-club
type: note
date: 2026-11-24
branch: feat/datos-del-club
---

# datos-del-club — notas

## Lo que quedó

- Migración `20261128000100_club_info.sql`: columnas nuevas en `clubs` con sus checks, tabla `club_photos` (lectura
  pública, escritura solo por RPC) y las RPC `save_club_info`, `add_club_photo`, `remove_club_photo`, `move_club_photo`.
- Ajustes → «Datos del club» (`/club/ajustes/datos`), después de «Club».
- «El club» al final de Inicio y de la portada sin sesión.
- Mapa: `leaflet` 1.9.4 + `react-leaflet` 5.0.0, tiles de OpenStreetMap, sin clave. Se carga solo en el navegador; en
  Inicio, cuando la sección está por verse.

## Distinto al diseño

- Los chips de servicios usan el ícono `check`, no uno por servicio.
- El e2e corre en Pádel Norte y responde las tiles con una imagen local, para no depender de la red.

## Arreglos de la revisión

- El link de Google Maps solo acepta hosts de Google de verdad: `google.evil.com/maps` ya no pasa (en la app, en la RPC
  y en el check de la tabla).
- `remove_club_photo` relee la foto con el club bloqueado: un «mover» al mismo tiempo ya no deja huecos en el orden.
- Si al agregar una foto el path ya existe (un reintento), no se borra el archivo de la foto que ya está.
- Tests nuevos: mover la última hacia adelante, paso inválido, path repetido, escritura directa en `club_photos`
  rechazada (42501), hosts parecidos a Google.

## Verificación

- pgTAP 1374 (35 nuevos), Vitest 1341, e2e 26 (en serie; `club-home` y `club-setup` fallaron una vez por tiempos y
  pasaron al repetir), lint, tsc y build.
