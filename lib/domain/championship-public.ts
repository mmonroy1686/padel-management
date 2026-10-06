import { toFixture, type Fixture, type GroupRow, type MatchRow } from './championship-fixture'
import { toChampionship, type CategoryRow, type Championship, type ChampionshipRow, type EntryRow } from './championships'

// The public page of a championship (/c/<code>) reads public_championship: names, dates, categories, pairs and,
// once published, the groups and matches. It is turned into the same Championship and Fixture the app uses, with
// neutral values for what the public never sees (levels, prices, payments).

export type PublicChampionship = {
  clubName: string
  logoPath: string | null
  timezone: string
  code: string
  championship: Championship
  fixture: Fixture
  courts: { id: string; name: string }[]
}

type PublicEntry = { id: string; player1_name: string; player2_name: string }
type PublicCategory = Pick<
  CategoryRow,
  'id' | 'name' | 'gender' | 'format' | 'group_size' | 'qualifiers_per_group' | 'match_minutes' | 'match_rules' | 'sort_order'
> & { entries: PublicEntry[] }
type PublicData = {
  club: { name: string; logo_path: string | null; timezone: string }
  championship: {
    id: string
    name: string
    rules: string
    status: ChampionshipRow['status']
    public_code: string
    poster_path: string | null
  }
  windows: ChampionshipRow['windows']
  courts: { id: string; name: string }[]
  categories: PublicCategory[]
  groups: GroupRow[]
  matches: MatchRow[]
}

const CODE = /^[a-z0-9]+(-[a-z0-9]+)*$/

// The codes publish_championship makes ("copa-de-primavera-7k2f").
export function isPublicCode(value: string): boolean {
  return value.length >= 3 && value.length <= 40 && CODE.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function entryRow(entry: PublicEntry, index: number): EntryRow {
  return {
    id: entry.id,
    player1_level: 0,
    player2_level: 0,
    status: 'active',
    seed: null,
    unavailability_approved: false,
    // The database sends them in sign-up order; the order is all the page needs.
    created_at: new Date(index * 1000).toISOString(),
    player1: { id: '', name: entry.player1_name, profile_id: null },
    player2: { id: '', name: entry.player2_name, profile_id: null },
    payments: [],
    unavailability: [],
  }
}

// public_championship's jsonb (its shape is pinned by supabase/tests/database/championship_public.test.sql);
// null when the link leads nowhere.
export function readPublicChampionship(value: unknown): PublicChampionship | null {
  if (!isRecord(value) || !isRecord(value.club) || !isRecord(value.championship)) return null
  if (!['windows', 'courts', 'categories', 'groups', 'matches'].every((key) => Array.isArray(value[key]))) return null
  const data = value as PublicData
  const row: ChampionshipRow = {
    id: data.championship.id,
    name: data.championship.name,
    rules: data.championship.rules,
    poster_path: data.championship.poster_path,
    public_code: data.championship.public_code,
    status: data.championship.status,
    registration_opens_at: null,
    registration_closes_at: null,
    max_categories_per_player: 1,
    windows: data.windows,
    categories: data.categories.map(
      (category): CategoryRow => ({
        ...category,
        level_min: null,
        level_max: null,
        min_pairs: 2,
        max_pairs: 64,
        price: 0,
        seeding: 'manual',
        status: 'open',
        merged_into: null,
        entries: category.entries.map(entryRow),
      }),
    ),
  }
  return {
    clubName: data.club.name,
    logoPath: data.club.logo_path,
    timezone: data.club.timezone,
    code: data.championship.public_code,
    championship: toChampionship(row, data.club.timezone),
    fixture: toFixture(data.groups, data.matches),
    courts: data.courts,
  }
}
