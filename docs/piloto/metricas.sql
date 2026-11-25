-- Métricas del piloto (docs/features/metricas-piloto/design.md). Solo leen: no cambian nada.
--
-- Cómo correrlas (README, «Métricas del piloto»): en Supabase → SQL Editor, pegá UNA consulta por vez, cambiá el slug
-- del club en su primera línea (`where slug = 'rustic'`) y corré. El SQL Editor muestra solo el resultado de la
-- última consulta, por eso cada una trae su propio encabezado (params y weeks) y se puede correr sola.
--
-- Semanas de lunes a domingo en la zona horaria del club; las últimas 8, de la más vieja a la actual (que va por la
-- mitad). Para ver más, cambiá `interval '7 weeks'`.
-- Los ejemplos de resultado son del seed local (`npm run demo:data`) del 25/11/2026: ilustran la forma, no son datos
-- reales.

-- 1. Reservas por origen: las que hizo el jugador (online, incluye los partidos abiertos) contra las que cargó
--    recepción, por la semana del turno. Solo reservas confirmadas.
with params as (select id as club_id, timezone as tz from public.clubs where slug = 'rustic'),
weeks as (
  select ws::date as week, ws at time zone p.tz as from_ts, (ws + interval '7 days') at time zone p.tz as to_ts
  from params p,
       generate_series(date_trunc('week', now() at time zone p.tz) - interval '7 weeks',
                       date_trunc('week', now() at time zone p.tz), interval '1 week') as ws
)
select w.week as semana,
       count(b.id) filter (where b.source = 'online') as online,
       count(b.id) filter (where b.source = 'reception') as recepcion,
       count(b.id) as total,
       round(100.0 * count(b.id) filter (where b.source = 'online') / nullif(count(b.id), 0), 1) as pct_online
from weeks w
left join public.bookings b
  on b.club_id = (select club_id from params) and b.status = 'confirmed'
 and b.starts_at >= w.from_ts and b.starts_at < w.to_ts
group by w.week
order by w.week;
-- semana     | online | recepcion | total | pct_online
-- 2026-11-16 |     19 |        37 |    56 |       33.9

-- 2. Ocupación por cancha y franja: horas ocupadas sobre horas abiertas, en canchas activas. Franjas: mañana
--    (apertura a 14:00), tarde (14:00 a 19:00) y noche (19:00 al cierre), con el horario de hoy del club. Ocupan las
--    reservas, turnos fijos, partidos, torneos, campeonatos y day use; los bloqueos y las retenciones de la lista de
--    espera no.
with params as (select id as club_id, timezone as tz, opens_at, closes_at from public.clubs where slug = 'rustic'),
weeks as (
  select ws::date as week
  from params p,
       generate_series(date_trunc('week', now() at time zone p.tz) - interval '7 weeks',
                       date_trunc('week', now() at time zone p.tz), interval '1 week') as ws
),
bands (band, ord, from_time, to_time) as (
  values ('mañana', 1, time '00:00', time '14:00'), ('tarde', 2, time '14:00', time '19:00'),
         ('noche', 3, time '19:00', time '24:00')
),
windows as (
  -- Each day, each band cut to the club's hours.
  select w.week, b.band, b.ord,
         tstzrange((d + greatest(p.opens_at, b.from_time)) at time zone p.tz,
                   (d + least(p.closes_at, b.to_time)) at time zone p.tz) as span
  from params p, weeks w, bands b,
       generate_series(w.week::timestamp, w.week + interval '6 days', interval '1 day') as d
  where greatest(p.opens_at, b.from_time) < least(p.closes_at, b.to_time)
)
select w.week as semana, c.name as cancha, w.band as franja,
       round(sum(extract(epoch from upper(w.span) - lower(w.span))) / 3600, 1) as horas_abiertas,
       round(coalesce(sum(o.busy), 0) / 3600, 1) as horas_ocupadas,
       round(100 * coalesce(sum(o.busy), 0) / sum(extract(epoch from upper(w.span) - lower(w.span))), 1) as pct
from windows w
cross join public.courts c
left join lateral (
  select sum(extract(epoch from upper(o.period * w.span) - lower(o.period * w.span))) as busy
  from public.court_occupancy o
  where o.court_id = c.id and o.period && w.span and o.kind not in ('block', 'hold')
) o on true
where c.club_id = (select club_id from params) and c.is_active
group by w.week, c.sort_order, c.name, w.ord, w.band
order by w.week, c.sort_order, w.ord;
-- semana     | cancha   | franja | horas_abiertas | horas_ocupadas | pct
-- 2026-11-16 | Cancha 1 | mañana |           42.0 |            0.0 |  0.0
-- 2026-11-16 | Cancha 1 | tarde  |           35.0 |            9.5 | 27.1
-- 2026-11-16 | Cancha 1 | noche  |           28.0 |           17.5 | 62.5

-- 3. Cancelaciones, por la semana del turno. Tardías: canceladas con menos aviso que el que pide el club
--    (cancellation_notice_hours de hoy). El porcentaje es sobre todas las reservas de la semana.
with params as (select id as club_id, timezone as tz, cancellation_notice_hours as notice from public.clubs where slug = 'rustic'),
weeks as (
  select ws::date as week, ws at time zone p.tz as from_ts, (ws + interval '7 days') at time zone p.tz as to_ts
  from params p,
       generate_series(date_trunc('week', now() at time zone p.tz) - interval '7 weeks',
                       date_trunc('week', now() at time zone p.tz), interval '1 week') as ws
)
select w.week as semana,
       count(b.id) as reservas,
       count(b.id) filter (where b.status = 'cancelled') as canceladas,
       count(b.id) filter (where b.status = 'cancelled'
                             and b.cancelled_at > b.starts_at - make_interval(hours => (select notice from params))) as tardias,
       round(100.0 * count(b.id) filter (where b.status = 'cancelled') / nullif(count(b.id), 0), 1) as pct_canceladas
from weeks w
left join public.bookings b
  on b.club_id = (select club_id from params) and b.starts_at >= w.from_ts and b.starts_at < w.to_ts
group by w.week
order by w.week;
-- semana     | reservas | canceladas | tardias | pct_canceladas
-- 2026-11-16 |       56 |          0 |       0 |            0.0

-- 4. Turnos recuperados por la lista de espera: un turno que se liberó, se le guardó a alguien que esperaba y lo
--    reservó. Por la semana del turno, con lo que valían esas reservas.
with params as (select id as club_id, timezone as tz from public.clubs where slug = 'rustic'),
weeks as (
  select ws::date as week, ws at time zone p.tz as from_ts, (ws + interval '7 days') at time zone p.tz as to_ts
  from params p,
       generate_series(date_trunc('week', now() at time zone p.tz) - interval '7 weeks',
                       date_trunc('week', now() at time zone p.tz), interval '1 week') as ws
)
select w.week as semana,
       count(h.id) filter (where h.status = 'claimed') as recuperados,
       count(h.id) as ofrecidos,
       coalesce(sum(b.price) filter (where h.status = 'claimed'), 0) as pesos_recuperados
from weeks w
left join public.slot_holds h
  on h.club_id = (select club_id from params) and h.starts_at >= w.from_ts and h.starts_at < w.to_ts
left join public.bookings b on b.id = h.booking_id
group by w.week
order by w.week;
-- semana     | recuperados | ofrecidos | pesos_recuperados
-- 2026-11-16 |           0 |         0 |                 0

-- 5. Jugadores activos y nuevos. Activo: tuvo en la semana una reserva (titular o compañero cargado), un partido
--    abierto, un day use, un torneo, o se anotó a un campeonato. Nuevo: se sumó al club esa semana.
with params as (select id as club_id, timezone as tz from public.clubs where slug = 'rustic'),
weeks as (
  select ws::date as week, ws at time zone p.tz as from_ts, (ws + interval '7 days') at time zone p.tz as to_ts
  from params p,
       generate_series(date_trunc('week', now() at time zone p.tz) - interval '7 weeks',
                       date_trunc('week', now() at time zone p.tz), interval '1 week') as ws
),
activity (player_id, at) as (
  select b.player_id, b.starts_at from public.bookings b
   where b.club_id = (select club_id from params) and b.status = 'confirmed' and b.player_id is not null
  union all
  select bp.player_id, b.starts_at from public.booking_players bp join public.bookings b on b.id = bp.booking_id
   where b.club_id = (select club_id from params) and b.status = 'confirmed' and bp.player_id is not null
  union all
  select s.player_id, m.starts_at from public.match_slots s join public.open_matches m on m.id = s.match_id
   where m.club_id = (select club_id from params) and m.cancelled_at is null and s.player_id is not null
  union all
  select d.player_id, (d.on_date::timestamp at time zone (select tz from params)) from public.day_use_passes d
   where d.club_id = (select club_id from params) and d.cancelled_at is null and d.player_id is not null
  union all
  select e.player_id, t.starts_at from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
   where e.club_id = (select club_id from params) and e.removed_at is null and t.cancelled_at is null
     and e.player_id is not null
  union all
  select unnest(array[e.player1_id, e.player2_id]), e.created_at from public.championship_entries e
   where e.club_id = (select club_id from params)
)
select w.week as semana,
       (select count(distinct a.player_id) from activity a
         where a.player_id is not null and a.at >= w.from_ts and a.at < w.to_ts) as activos,
       (select count(*) from public.club_members m
         where m.club_id = (select club_id from params) and m.role = 'player'
           and m.created_at >= w.from_ts and m.created_at < w.to_ts) as nuevos
from weeks w
order by w.week;
-- semana     | activos | nuevos
-- 2026-11-16 |      16 |      0
-- 2026-11-23 |      56 |     23

-- 6. Cobros por medio, por la semana en que se confirmaron: efectivo, transferencia y POS. Devueltos aparte (se
--    cobraron y después se devolvieron). Incluye reservas, partidos, torneos, campeonatos y day use.
with params as (select id as club_id, timezone as tz from public.clubs where slug = 'rustic'),
weeks as (
  select ws::date as week, ws at time zone p.tz as from_ts, (ws + interval '7 days') at time zone p.tz as to_ts
  from params p,
       generate_series(date_trunc('week', now() at time zone p.tz) - interval '7 weeks',
                       date_trunc('week', now() at time zone p.tz), interval '1 week') as ws
)
select w.week as semana,
       case p.method when 'cash' then 'efectivo' when 'transfer' then 'transferencia' when 'card' then 'POS' end as medio,
       count(*) filter (where p.status = 'confirmed') as cobros,
       coalesce(sum(p.amount) filter (where p.status = 'confirmed'), 0) as pesos,
       count(*) filter (where p.status = 'refunded') as devueltos,
       coalesce(sum(p.amount) filter (where p.status = 'refunded'), 0) as pesos_devueltos
from weeks w
join public.payments p
  on p.club_id = (select club_id from params) and p.status in ('confirmed', 'refunded')
 and p.confirmed_at >= w.from_ts and p.confirmed_at < w.to_ts
group by w.week, p.method
order by w.week, p.method;
-- semana     | medio         | cobros | pesos  | devueltos | pesos_devueltos
-- 2026-11-16 | efectivo      |     36 |  52800 |         0 |               0
-- 2026-11-16 | transferencia |     12 |  19200 |         0 |               0

-- 7. Faltazos: reservas confirmadas que recepción marcó «No vino», sobre las que ya empezaron esa semana.
with params as (select id as club_id, timezone as tz from public.clubs where slug = 'rustic'),
weeks as (
  select ws::date as week, ws at time zone p.tz as from_ts, (ws + interval '7 days') at time zone p.tz as to_ts
  from params p,
       generate_series(date_trunc('week', now() at time zone p.tz) - interval '7 weeks',
                       date_trunc('week', now() at time zone p.tz), interval '1 week') as ws
)
select w.week as semana,
       count(b.id) as jugadas,
       count(b.id) filter (where b.no_show_at is not null) as no_vino,
       round(100.0 * count(b.id) filter (where b.no_show_at is not null) / nullif(count(b.id), 0), 1) as pct_no_vino
from weeks w
left join public.bookings b
  on b.club_id = (select club_id from params) and b.status = 'confirmed'
 and b.starts_at >= w.from_ts and b.starts_at < w.to_ts and b.starts_at < now()
group by w.week
order by w.week;
-- semana     | jugadas | no_vino | pct_no_vino
-- 2026-11-16 |      56 |       0 |         0.0
