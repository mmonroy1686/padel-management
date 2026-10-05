import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkRead } from '@/app/(jugador)/avisos/mark-read'

describe('MarkRead', () => {
  it('marks the avisos read once the screen is open', async () => {
    const action = vi.fn(async () => {})
    render(<MarkRead action={action} />)
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
  })
})
