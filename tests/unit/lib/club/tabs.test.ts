import { describe, expect, it } from 'vitest'
import { clubTabs } from '@/lib/club/tabs'

describe('clubTabs', () => {
  it('shows the screens that exist so far to reception and admin', () => {
    expect(clubTabs('reception').map((tab) => tab.label)).toEqual(['Grilla', 'Calendario', 'Cobros'])
    expect(clubTabs('admin').map((tab) => tab.href)).toEqual(['/club/grilla', '/club/calendario', '/club/cobros'])
  })
})
