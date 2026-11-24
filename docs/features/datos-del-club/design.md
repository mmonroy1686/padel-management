---
feature: datos-del-club
type: design
status: approved
date: 2026-11-24
branch: feat/datos-del-club
---

# datos-del-club — diseño

## Para qué

El jugador hoy no tiene dónde ver cómo llegar al club, cómo es ni cómo escribirle. Con este corte, el admin carga en
Ajustes los datos del club (dirección, ubicación en el mapa, link de Google Maps, WhatsApp, Instagram, email, servicios
y fotos) y el jugador los ve en **Inicio**, con un botón que abre el chat de WhatsApp del club.

## Principios

- **Un solo lugar para el jugador:** una sección «El club» al final de Inicio, también en el Inicio sin sesión (la
  portada), así sirve para quien todavía no se registró. No hay pantalla ni pestaña nueva.
- **Reusar lo que hay:** el WhatsApp es `clubs.phone` (el mismo del flyer); las fotos van al bucket público
  `club-logos`, en la carpeta del club, como el logo y el fondo del flyer.
- **Mapa sin claves ni costo:** OpenStreetMap con Leaflet. Google Maps solo como link, nunca embebido.
- **Todo lo cargado es opcional:** lo que falta no se muestra. Si el club no cargó nada, la sección no aparece.

## Datos

Columnas nuevas en `clubs` (las edita el admin; la policy de update de `clubs` ya lo limita a ellos):

| columna | tipo | regla |
| --- | --- | --- |
| `address` | text | hasta 200 caracteres |
| `latitude`, `longitude` | double precision | las dos o ninguna; -90..90 y -180..180 |
| `google_maps_url` | text | `https://` en `google.com/maps`, `maps.google.com`, `maps.app.goo.gl` o `goo.gl/maps`; hasta 500 |
| `instagram` | text | usuario sin `@`: `^[a-z0-9._]{1,30}$` |
| `contact_email` | text | formato de email, hasta 200 |
| `amenities` | text[] | valores de una lista fija (abajo), sin repetidos |

- **Servicios (lista fija):** vestuarios, duchas, estacionamiento, bar, alquiler de paletas, venta de pelotas,
  canchas techadas, wifi, accesible. En la base se guardan claves (`lockers`, `showers`, `parking`, `bar`,
  `racket_rental`, `balls`, `covered`, `wifi`, `accessible`); el texto vive en la app.
- **Fotos:** tabla `club_photos (id, club_id, path, position, created_at)`, hasta **8** por club.
  - Lectura pública (como el logo: el bucket ya es público). Insertar, borrar y reordenar: solo admins del club.
  - `path` dentro de la carpeta del club: `<club_id>/photo-<timestamp>.jpg`.
  - El navegador achica la foto a 1600 px de lado mayor y la pasa a JPG antes de subirla, como el fondo del flyer.
    Así no hay que cambiar los límites del bucket (2 MB) y la portada carga rápido.
- RPC `save_club_info(...)` (admin) valida y guarda todos los campos en una transacción; RPC `add_club_photo`,
  `remove_club_photo`, `move_club_photo` para las fotos. Errores nuevos: `invalid_location`, `invalid_maps_url`,
  `invalid_instagram`, `invalid_email`, `invalid_amenity`, `too_many_photos`.

## Ajustes → «Datos del club»

Una sección nueva en Ajustes, después de «Club»: `/club/ajustes/datos`.

- **Contacto:** WhatsApp (el mismo campo del flyer: se edita en los dos lugares), Instagram, email.
- **Ubicación:**
  - Dirección (texto libre) con **Buscar en el mapa**, que centra el mapa en la dirección (Nominatim de
    OpenStreetMap, una búsqueda por clic, nunca mientras se escribe).
  - Un mapa: **tocar el mapa mueve el pin**. Se puede arrastrar.
  - **Link de Google Maps:** al pegarlo, si el link trae coordenadas (`@-34.9,-56.1`, `!3d…!4d…`, `?q=lat,lng`), el pin
    se mueve ahí. Los links cortos (`maps.app.goo.gl`) no las traen: se guardan igual, y el pin se marca a mano.
  - **Quitar ubicación** borra el pin.
- **Servicios:** casillas.
- **Fotos:** subir (de a una o varias), ver miniaturas, quitar, y mover con ← → para cambiar el orden. La primera es la
  portada.

## Inicio → «El club»

Al final de Inicio (con sesión) y de la portada (sin sesión), solo si hay algo cargado:

- **Fotos:** carrusel horizontal con scroll nativo (snap), la primera grande. Tocar una la abre en grande.
- **Dirección** y un **mapa** chico con el pin (sin zoom con la rueda ni arrastre accidental; se mueve con dos dedos
  o con los botones de zoom). Debajo, **Cómo llegar**: abre el link de Google Maps del club, o si no hay, uno armado
  con las coordenadas (`https://www.google.com/maps/search/?api=1&query=lat,lng`).
- **Botones de contacto:** **WhatsApp** (`https://wa.me/<phone>` con un saludo «Hola, les escribo desde la app de
  <club>»), **Instagram** (`https://instagram.com/<usuario>`), **Email** (`mailto:`).
- **Servicios** como chips con ícono.
- **Horario** del club (ya existe: apertura y cierre).

El mapa se carga solo en el navegador y cuando la sección está cerca de verse, para no sumarle peso a Inicio.

## Mapa

- `leaflet` 1.9.4 + `react-leaflet` 5.0.0 (React 19). Tiles de `tile.openstreetmap.org` con la atribución
  «© OpenStreetMap». Sin clave.
- Un componente `ClubMap` con dos modos: `edit` (tocar/arrastrar mueve el pin) y `view` (solo muestra).
- Nominatim: se llama desde el navegador, un pedido por clic, con `countrycodes` del país de la zona horaria del club
  para acotar. Respeta su política de uso (sin autocompletar, poco volumen).

## Tests

- **pgTAP:** `save_club_info` solo admin; cada validación da su error; lat sin lng da `invalid_location`; fotos:
  máximo 8, solo admin, orden, path fuera de la carpeta del club rechazado; cualquiera lee fotos de un club.
- **Unit:** parser de coordenadas del link de Google (los tres formatos y el link corto); validación del formulario;
  link de «Cómo llegar»; link de WhatsApp; qué partes de «El club» se muestran según lo cargado.
- **e2e:** el admin carga dirección, pin, WhatsApp, un servicio y una foto; el jugador ve en Inicio la foto, el mapa, el
  botón de WhatsApp con su `wa.me` y el chip.

## Fuera de alcance

- Varias sedes por club.
- Horarios distintos por día (se muestra el horario general que ya existe).
- Reseñas o calificaciones.
- Mapa de Google embebido (pide clave y facturación).

## Preguntas abiertas

Ninguna que bloquee. Valores elegidos, que se pueden cambiar: máximo 8 fotos, la lista de servicios, la sección después
de «Club» en Ajustes.
