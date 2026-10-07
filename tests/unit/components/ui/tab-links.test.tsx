import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TabLinks } from '@/components/ui/tab-links'

describe('TabLinks', () => {
  it('links every tab and marks the current one', () => {
    render(
      <TabLinks
        label="Secciones del campeonato"
        current="fixture"
        items={[
          { key: 'hoy', label: 'Hoy', href: '/club/torneos/campeonatos/ch1?ver=hoy' },
          { key: 'fixture', label: 'Fixture', href: '/club/torneos/campeonatos/ch1?ver=fixture' },
        ]}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Secciones del campeonato' })
    expect(within(nav).getByRole('link', { name: 'Fixture' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Hoy' })).not.toHaveAttribute('aria-current')
    expect(within(nav).getByRole('link', { name: 'Hoy' })).toHaveAttribute('href', '/club/torneos/campeonatos/ch1?ver=hoy')
  })
})
