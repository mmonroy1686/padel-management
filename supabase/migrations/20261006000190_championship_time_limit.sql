-- Campeonatos: a category's matches can have a time limit (they end when the time is up) or none (best of 3
-- sets, as long as it takes). The limit lives in match_rules (time_limit_minutes, null for none); the minutes
-- planned for a match stay apart, for the schedule, and the limit fits in them.

drop function public.add_championship_category(uuid, text, public.championship_gender, integer, integer, integer, public.championship_format, integer, integer,
  integer, public.championship_seeding, text, boolean, integer, integer);

create function public.add_championship_category(
  p_championship_id uuid,
  p_name text,
  p_gender public.championship_gender,
  p_min_pairs integer,
  p_max_pairs integer,
  p_price integer,
  p_format public.championship_format,
  p_group_size integer,
  p_qualifiers integer,
  p_match_minutes integer,
  p_seeding public.championship_seeding,
  p_third_set text,
  p_golden_point boolean,
  p_level_min integer default null,
  p_level_max integer default null,
  -- Minutes a match lasts at most (it ends when the time is up); null: best of 3 sets, no limit.
  p_time_limit integer default null
)
returns public.championship_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_championship public.championships := private.staff_championship(p_championship_id);
  v_name text := trim(p_name);
  v_category public.championship_categories;
begin
  if v_championship.status <> 'draft' then
    perform private.fail('invalid_state');
  end if;
  if v_name is null or length(v_name) not between 1 and 40
     or p_gender is null or p_format is null or p_seeding is null
     or (p_level_min is null) <> (p_level_max is null)
     or (p_level_min is not null
         and (p_level_min not between 1 and 8 or p_level_max not between 1 and 8 or p_level_min > p_level_max))
     or p_min_pairs is null or p_max_pairs is null
     or p_min_pairs not between 2 and 64 or p_max_pairs not between 2 and 64 or p_min_pairs > p_max_pairs
     or p_price is null or p_price not between 0 and 10000000
     or p_group_size is null or p_group_size not in (3, 4)
     or p_qualifiers is null or p_qualifiers not between 1 and p_group_size - 1
     or p_match_minutes is null or p_match_minutes not between 30 and 240
     or p_third_set is null or p_third_set not in ('super_tiebreak', 'full')
     or p_golden_point is null
     or (p_time_limit is not null and (p_time_limit not between 20 and 180 or p_time_limit > p_match_minutes)) then
    perform private.fail('invalid_input');
  end if;

  begin
    insert into public.championship_categories (club_id, championship_id, name, gender, level_min, level_max,
                                                min_pairs, max_pairs, price, format, group_size,
                                                qualifiers_per_group, match_rules, match_minutes, seeding,
                                                sort_order)
    values (v_championship.club_id, v_championship.id, v_name, p_gender, p_level_min, p_level_max, p_min_pairs,
            p_max_pairs, p_price, p_format, p_group_size, p_qualifiers,
            jsonb_build_object('sets', 3, 'games', 6, 'tiebreak', true, 'third_set', p_third_set,
                               'super_tiebreak_points', 10, 'golden_point', p_golden_point,
                               'time_limit_minutes', p_time_limit),
            p_match_minutes, p_seeding,
            coalesce((select max(c.sort_order) + 1 from public.championship_categories c
                      where c.championship_id = v_championship.id), 0))
    returning * into v_category;
  exception when unique_violation then
    perform private.fail('category_exists');
  end;
  return v_category;
end;
$$;

revoke execute on function public.add_championship_category(uuid, text, public.championship_gender, integer, integer, integer, public.championship_format, integer, integer,
  integer, public.championship_seeding, text, boolean, integer, integer, integer) from public, anon;
grant execute on function public.add_championship_category(uuid, text, public.championship_gender, integer, integer, integer, public.championship_format, integer, integer,
  integer, public.championship_seeding, text, boolean, integer, integer, integer) to authenticated;
