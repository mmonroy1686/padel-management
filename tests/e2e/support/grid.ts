import type { Locator, Page } from '@playwright/test'

// The club's grid shows one court at a time on a phone (the e2e project): pick the court that holds `cell` before
// acting on it. On a wider screen, or when it is already in view, nothing to do.
export async function revealInGrid(page: Page, cell: Locator): Promise<void> {
  const picker = page.getByRole('group', { name: 'Cancha' })
  if (!(await picker.isVisible())) return
  if (await cell.isVisible()) return
  for (const court of await picker.getByRole('button').all()) {
    await court.click()
    if (await cell.isVisible()) return
  }
}

// The same, when the court is known.
export async function showCourt(page: Page, courtName: string): Promise<void> {
  const picker = page.getByRole('group', { name: 'Cancha' })
  if (await picker.isVisible()) await picker.getByRole('button', { name: courtName, exact: true }).click()
}
