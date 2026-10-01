import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SectionTitle } from '@/components/nav/section-title'
import { clubTabs } from '@/lib/club/tabs'

const route = vi.hoisted(() => ({ pathname: '/club/cobros' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }))

describe('SectionTitle', () => {
  it('names the section, also on its detail screens', () => {
    render(<SectionTitle items={clubTabs('admin')} fallback="Panel del club" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Cobros' })).toBeInTheDocument()
  })

  it('falls back when no tab matches', () => {
    route.pathname = '/club/torneos/123'
    const { unmount } = render(<SectionTitle items={clubTabs('admin')} fallback="Panel del club" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Torneos' })).toBeInTheDocument()
    unmount()
    route.pathname = '/club/otra'
    render(<SectionTitle items={clubTabs('admin')} fallback="Panel del club" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Panel del club' })).toBeInTheDocument()
  })
})
