import { expect, type Locator, type Page } from '@playwright/test'

// The grid has to be on screen before asking whether it shows the court picker: right after a click on «Grilla» the
// previous page may still be there, and a picker that is not visible yet reads as "no picker".
async function courtPicker(page: Page): Promise<Locator> {
  await page.getByRole('table', { name: 'Turnos por cancha' }).waitFor()
  return page.getByRole('group', { name: 'Cancha' })
}

// A tap that lands before the grid hydrates does nothing: tap again until the court shows as picked.
async function pickCourt(button: Locator): Promise<void> {
  await expect(async () => {
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
}

// The club's grid shows one court at a time on a phone (the e2e project): pick the court that holds `cell` before
// acting on it. On a wider screen, or when it is already in view, nothing to do.
export async function revealInGrid(page: Page, cell: Locator): Promise<void> {
  const picker = await courtPicker(page)
  if (!(await picker.isVisible())) return
  if (await cell.isVisible()) return
  for (const court of await picker.getByRole('button').all()) {
    await pickCourt(court)
    if (await cell.isVisible()) return
  }
}

// The same, when the court is known.
export async function showCourt(page: Page, courtName: string): Promise<void> {
  const picker = await courtPicker(page)
  if (await picker.isVisible()) await pickCourt(picker.getByRole('button', { name: courtName, exact: true }))
}
