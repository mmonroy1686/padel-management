import type { ChampionshipStatus } from './championships'

// Design: "Pestañas del club": the page of a championship in tabs, each a link (?ver=…). A tab that does not fit
// the state is not offered; without one (or with one that does not fit) the page opens the one its state calls for.

export const CHAMPIONSHIP_TABS = ['hoy', 'fixture', 'zonas', 'parejas', 'ajustes'] as const
export type ChampionshipTab = (typeof CHAMPIONSHIP_TABS)[number]

export const TAB_LABELS: Record<ChampionshipTab, string> = {
  hoy: 'Hoy',
  fixture: 'Fixture',
  zonas: 'Zonas y llaves',
  parejas: 'Parejas',
  ajustes: 'Ajustes',
}

const TABS: Record<ChampionshipStatus, ChampionshipTab[]> = {
  draft: ['ajustes'],
  registration: ['parejas', 'ajustes'],
  closed: ['fixture', 'parejas', 'ajustes'],
  drawn: ['fixture', 'zonas', 'parejas', 'ajustes'],
  published: ['hoy', 'fixture', 'zonas', 'parejas', 'ajustes'],
  in_progress: ['hoy', 'fixture', 'zonas', 'parejas', 'ajustes'],
  finished: ['fixture', 'zonas', 'parejas'],
  cancelled: ['parejas'],
}

const DEFAULT_TAB: Record<ChampionshipStatus, ChampionshipTab> = {
  draft: 'ajustes',
  registration: 'parejas',
  closed: 'fixture',
  drawn: 'fixture',
  published: 'hoy',
  in_progress: 'hoy',
  finished: 'zonas',
  cancelled: 'parejas',
}

export function championshipTabs(status: ChampionshipStatus): ChampionshipTab[] {
  return TABS[status]
}

export function defaultTab(status: ChampionshipStatus): ChampionshipTab {
  return DEFAULT_TAB[status]
}

// ?ver=<tab>: the one asked for when the state offers it, otherwise the default.
export function pickTab(status: ChampionshipStatus, requested: string | undefined): ChampionshipTab {
  return TABS[status].find((tab) => tab === requested) ?? DEFAULT_TAB[status]
}
