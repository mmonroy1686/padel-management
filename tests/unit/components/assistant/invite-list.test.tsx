import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InviteList, inviteResultText } from '@/components/assistant/invite-list'
import type { InviteAction } from '@/lib/actions/result'
import type { CandidateView } from '@/lib/domain/slot-planner'

const CANDIDATES: CandidateView[] = [
  { playerId: 'b', name: 'Bruno Díaz', score: 28, strong: true, chips: [{ text: 'Suele estar libre los jueves de noche', hit: true }] },
  { playerId: 'h', name: 'Hugo Paz', score: 20, strong: true, chips: [] },
]
const MESSAGE = '🎾 Jueves 1/10 20:00 · Cancha 2 · 5ª/6ª mixto\nSumate acá: https://rustic.app/partidos/m9'

describe('InviteList', () => {
  it('invites one player, marks her and does not offer it again', async () => {
    const inviteAction = vi.fn<InviteAction>(async (_matchId, ids) => ({ ok: true, invited: ids.length }))
    render(<InviteList matchId="m9" candidates={CANDIDATES} message={MESSAGE} inviteAction={inviteAction} />)
    expect(screen.getByRole('list', { name: 'Por qué Bruno Díaz' })).toHaveTextContent('Suele estar libre')
    await userEvent.click(screen.getByRole('button', { name: 'Invitar a Bruno Díaz' }))
    expect(inviteAction).toHaveBeenCalledWith('m9', ['b'])
    expect(await screen.findByText('Invitado ✓')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invitar a Bruno Díaz' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Le avisamos a 1 en la app y por mail.')
  })

  it('invites the best ones at once', async () => {
    const inviteAction = vi.fn<InviteAction>(async (_matchId, ids) => ({ ok: true, invited: ids.length }))
    render(<InviteList matchId="m9" candidates={CANDIDATES} message={MESSAGE} inviteAction={inviteAction} />)
    await userEvent.click(screen.getByRole('button', { name: 'Invitar a los mejores 2' }))
    expect(inviteAction).toHaveBeenCalledWith('m9', ['b', 'h'])
    await waitFor(() => expect(screen.getAllByText('Invitado ✓')).toHaveLength(2))
  })

  it('opens WhatsApp with the invitation and the match link', () => {
    render(<InviteList matchId="m9" candidates={CANDIDATES} message={MESSAGE} inviteAction={vi.fn<InviteAction>()} />)
    const href = screen.getByRole('link', { name: 'WhatsApp a Hugo Paz' }).getAttribute('href') ?? ''
    expect(href).toContain(encodeURIComponent('Hola Hugo!'))
    expect(href).toContain(encodeURIComponent('https://rustic.app/partidos/m9'))
  })

  it('opens the chat of a player who accepted WhatsApp; the rest share the text without a recipient', () => {
    render(
      <InviteList
        matchId="m9"
        candidates={CANDIDATES}
        message={MESSAGE}
        inviteAction={vi.fn<InviteAction>()}
        whatsapp={{ b: { phone: '099123456', whatsappConsent: true } }}
        timezone="America/Montevideo"
      />,
    )
    expect(screen.getByRole('link', { name: 'WhatsApp a Bruno Díaz' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/59899123456\?text=/)
    expect(screen.getByRole('link', { name: 'WhatsApp a Hugo Paz' }).getAttribute('href')).not.toMatch(/wa\.me\/598/)
  })

  it('says why an invitation failed', async () => {
    const inviteAction = vi.fn<InviteAction>(async () => ({ ok: false, message: 'El partido ya no está abierto.' }))
    render(<InviteList matchId="m9" candidates={CANDIDATES} message={MESSAGE} inviteAction={inviteAction} />)
    await userEvent.click(screen.getByRole('button', { name: 'Invitar a Hugo Paz' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El partido ya no está abierto.')
    expect(screen.queryByText('Invitado ✓')).not.toBeInTheDocument()
  })

  it('counts only the avisos that went out', () => {
    expect(inviteResultText(2, 2)).toBe('Les avisamos a 2 en la app y por mail.')
    expect(inviteResultText(1, 3)).toBe('Le avisamos a 1 en la app y por mail. 2 ya estaban invitados.')
    expect(inviteResultText(0, 1)).toBe('No mandamos avisos nuevos. 1 ya estaba invitado.')
  })
})
