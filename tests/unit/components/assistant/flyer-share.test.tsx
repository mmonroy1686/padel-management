import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlyerShare } from '@/components/assistant/flyer-share'
import { whatsappUrl } from '@/lib/domain/match-share'

const IMAGE = '/club/asistente/flyer?date=2026-10-01'
const TEXT = '🎾 Turnos libres — jueves 1/10\nCancha 1: 18:30'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) })))
  URL.createObjectURL = vi.fn(() => 'blob:flyer')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'canShare')
})

describe('FlyerShare', () => {
  it('shows the preview and downloads the image when the phone cannot share files', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<FlyerShare imageUrl={IMAGE} fileName="turnos-libres-2026-10-01.png" text={TEXT} />)
    expect(screen.getByRole('img', { name: 'Flyer de turnos libres' })).toHaveAttribute('src', IMAGE)
    await userEvent.click(screen.getByRole('button', { name: 'Compartir imagen' }))
    expect(fetch).toHaveBeenCalledWith(IMAGE)
    expect(await screen.findByRole('status')).toHaveTextContent('Bajamos la imagen.')
    expect(click).toHaveBeenCalled()
  })

  it('shares the image with the text when the phone can', async () => {
    const share = vi.fn(async () => {})
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    render(<FlyerShare imageUrl={IMAGE} fileName="turnos-libres-2026-10-01.png" text={TEXT} />)
    await userEvent.click(screen.getByRole('button', { name: 'Compartir imagen' }))
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)], text: TEXT })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('copies the text and opens WhatsApp with it', async () => {
    const user = userEvent.setup()
    render(<FlyerShare imageUrl={IMAGE} fileName="turnos-libres-2026-10-01.png" text={TEXT} />)
    await user.click(screen.getByRole('button', { name: 'Copiar texto' }))
    await expect(navigator.clipboard.readText()).resolves.toBe(TEXT)
    expect(screen.getByRole('status')).toHaveTextContent('Texto copiado.')
    expect(screen.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute('href', whatsappUrl(TEXT))
  })
})
