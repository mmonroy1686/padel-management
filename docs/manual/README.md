# Manual de uso

Manual para jugadores, recepción y administración, con capturas reales. Se publica como página en
https://claude.ai/artifact/X4j5pG9DkZwJD3qqKjrNDa (privada; se comparte desde el menú Share).

## Cuándo se actualiza

Cada vez que un cambio modifica lo que ven o hacen los jugadores o el staff: en el mismo PR se corrige la sección
de `index.html` y se rehacen las capturas que cambiaron.

## Cómo rehacer las capturas

1. `npm run dev:local` y los datos demo (`npm run demo:data`).
2. `node scripts/manual-shots.mjs` (todas) o `node scripts/manual-shots.mjs j07` (las que empiezan con ese nombre).
3. Las capturas quedan en `img/`. `j…` son del jugador (celular), `c…` de recepción y `a…` de administración (compu).

La pantalla TV y el cuadro público (`a15`, `a16`) necesitan un campeonato publicado; con los datos demo no hay, y el
script las saltea.
