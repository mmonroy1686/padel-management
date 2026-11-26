---
feature: americano-parejas-fijas
type: design
status: approved
date: 2026-11-26
branch: feat/americano-parejas-fijas
---

# americano-parejas-fijas — design

## Purpose

Muchos americanos se juegan con parejas fijas: cada uno juega todo el torneo con el mismo compañero y las parejas rotan de rival. Hoy el americano solo rota compañeros. El club tiene que poder elegir el formato al crearlo, los jugadores anotarse con su compañero y el ranking ser por pareja.

Decisiones de Miguel (2026-11-26):

- **Inscripción:** el jugador se anota y elige a su compañero entre los miembros del club (al compañero le llega un aviso). El mostrador también arma parejas, con invitados.
- **Sin pareja:** se puede anotar «busco pareja»; antes de empezar, el mostrador los junta. No se arranca con nadie sin pareja.
- **Fixture:** todas contra todas (4 parejas = 3 rondas, 6 = 5, 8 = 7), con la opción de jugar menos rondas, como hoy. Ranking por pareja.

## Modelo

- `tournaments.format` (enum `tournament_format`: `rotating` | `fixed_pairs`, por defecto `rotating`). Los americanos existentes quedan `rotating`.
- `tournament_entries.pair_id uuid` (null = sin pareja). Dos inscripciones activas del mismo torneo comparten el `pair_id`. Solo lo escriben las funciones.
- El cupo sigue en jugadores (8, 12 o 16 = 4, 6 u 8 parejas) y cada jugador paga su inscripción, como hoy: Cobros no cambia.
- Rondas: con parejas fijas, de 1 a parejas − 1.
- `tournament_games` no cambia: cada partido ya es pareja A (a1 + a2) contra pareja B (b1 + b2).

## Funciones (Supabase)

- `create_tournament(..., p_format)`: recibe el formato.
- `join_tournament_pair(p_tournament_id, p_partner_id)`: el jugador se anota con un miembro del club. El compañero pasa las mismas reglas que quien se anota: categoría, género, no estar anotado y no tener nada a esa hora. Hacen falta dos lugares libres. Avisa al compañero.
- `join_tournament` sin compañero, en un torneo de parejas fijas, queda como «busca pareja».
- Al darse de baja o ser sacado alguien con pareja (`private.drop_entry`), su compañero sigue anotado, queda buscando pareja y recibe un aviso.
- `pair_tournament_entries(a, b)` (staff): junta a dos que buscan pareja y les avisa. `split_tournament_pair(entry)` (staff): los separa.
- `add_tournament_guest(..., p_partner_entry_id)` (staff): el invitado puede entrar directo como pareja de alguien que busca.
- `start_tournament`: con parejas fijas exige que todos tengan pareja (`unpaired_players`) y arma el todos contra todos entre parejas (método del círculo, el mismo de hoy pero sobre parejas, con el orden mezclado).
- Aviso nuevo `tournament_pair` con `event`: `added` (te anotaron con X), `paired` (el club te armó pareja con X), `left` (X se bajó y quedás buscando pareja).

Errores nuevos: `partner_already_in`, `partner_mismatch`, `partner_busy`, `unpaired_players`, `already_paired`.

## Pantallas

- **Nuevo americano:** campo «Formato»: «Cada ronda cambia la pareja» o «Parejas fijas». Con parejas fijas, el cupo se lee «8 jugadores (4 parejas)» y las rondas van hasta parejas − 1 (se proponen todas).
- **Torneo del jugador:** «Formato: parejas fijas, jugás todo el torneo con tu compañero». Los anotados se ven por pareja («Ana y Bruno») y aparte «Buscan pareja». El botón de anotarse abre una hoja con «Con mi compañero» (buscador de miembros) o «Busco pareja».
- **Gestión (mostrador):** la tabla de anotados suma la columna «Pareja»: el compañero, o «Busca pareja» con «Juntar con…» (los otros que buscan). Las parejas se pueden separar. «Agregar invitado» permite elegir «Pareja de».
- **Ranking, podio y tarjetas:** por pareja («Ana y Bruno»). En el fixture ya se ve pareja contra pareja.

## Fuera de alcance

Pagar por la pareja entera, cupos impares de parejas (byes) y que el compañero tenga que aceptar antes de quedar anotado (se le avisa y puede darse de baja).
