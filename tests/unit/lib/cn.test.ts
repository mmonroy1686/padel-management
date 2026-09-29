import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/cn'

describe('cn', () => {
  it('joins classes and drops falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('lets the later Tailwind class win when two conflict', () => {
    expect(cn('p-4 text-fg', 'p-6')).toBe('text-fg p-6')
  })
})
