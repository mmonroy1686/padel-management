/* eslint-disable @next/next/no-html-link-for-pages -- plain anchors: the listener covers every link, not only next/link */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivityProvider } from '@/components/ui/activity'

const route = vi.hoisted(() => ({ pathname: '/', search: '' }))
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}))

function Page() {
  return (
    <ActivityProvider>
      <a href="/reservar" onClick={(event) => event.preventDefault()}>
        Reservar
      </a>
      <a href="/" onClick={(event) => event.preventDefault()}>
        Acá mismo
      </a>
      <a href="#seccion">Más abajo</a>
      <a href="https://wa.me/123" onClick={(event) => event.preventDefault()}>
        WhatsApp
      </a>
      <a href="/torneos" target="_blank" onClick={(event) => event.preventDefault()}>
        En otra pestaña
      </a>
    </ActivityProvider>
  )
}

beforeEach(() => {
  route.pathname = '/'
  route.search = ''
})

describe('navigation activity', () => {
  it('lights the loading bar on a click to another screen until it opens', () => {
    const { rerender } = render(<Page />)
    fireEvent.click(screen.getByRole('link', { name: 'Reservar' }))
    expect(screen.getByRole('progressbar', { name: 'Cargando' })).toBeInTheDocument()
    route.pathname = '/reservar'
    rerender(<Page />)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('does not come back when the player returns to where the click started', async () => {
    const { rerender } = render(<Page />)
    fireEvent.click(screen.getByRole('link', { name: 'Reservar' }))
    route.pathname = '/reservar'
    rerender(<Page />)
    await act(() => new Promise((done) => requestAnimationFrame(() => done(null))))
    route.pathname = '/'
    rerender(<Page />)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('stays off for the same screen, anchors, other sites, new tabs and modified clicks', () => {
    render(<Page />)
    fireEvent.click(screen.getByRole('link', { name: 'Acá mismo' }))
    fireEvent.click(screen.getByRole('link', { name: 'Más abajo' }))
    fireEvent.click(screen.getByRole('link', { name: 'WhatsApp' }))
    fireEvent.click(screen.getByRole('link', { name: 'En otra pestaña' }))
    fireEvent.click(screen.getByRole('link', { name: 'Reservar' }), { metaKey: true })
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
