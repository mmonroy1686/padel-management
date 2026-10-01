import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ClubLogo } from '@/components/brand/club-logo'

vi.mock('@/lib/supabase/env', () => ({ getSupabaseEnv: () => ({ url: 'https://x.supabase.co', publishableKey: 'k' }) }))

describe('ClubLogo', () => {
  it('shows the logo the club uploaded, named after the club', () => {
    render(<ClubLogo club={{ name: 'Rustic Pádel', logo_path: 'c1/logo-1.png' }} />)
    expect(screen.getByRole('img', { name: 'Rustic Pádel' })).toHaveAttribute(
      'src',
      'https://x.supabase.co/storage/v1/object/public/club-logos/c1/logo-1.png',
    )
  })

  it('falls back to the placeholder without one', () => {
    render(<ClubLogo club={{ name: 'Rustic Pádel', logo_path: null }} />)
    expect(screen.getByRole('img', { name: 'Rustic Pádel' }).tagName.toLowerCase()).toBe('svg')
  })
})
