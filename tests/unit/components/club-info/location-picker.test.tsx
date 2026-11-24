import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Leaflet does not run in jsdom; the map's own behavior is covered by the e2e.
vi.mock('@/components/club-info/lazy-club-map', () => ({
  LazyClubMap: ({ label }: { label: string }) => <div role="region" aria-label={label} />,
}))

const { LocationPicker } = await import('@/components/club-info/location-picker')

const START = { latitude: -34.9, longitude: -56.19 }
const hidden = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value

function renderPicker(search = vi.fn<(url: string) => Promise<unknown>>(async () => [])) {
  render(<LocationPicker address={null} pin={null} googleMapsUrl={null} timezone="America/Montevideo" start={START} search={search} />)
  return search
}

describe('LocationPicker', () => {
  it('moves the pin to the coordinates of a pasted Google Maps link', () => {
    renderPicker()
    fireEvent.change(screen.getByLabelText('Link de Google Maps'), {
      target: { value: 'https://www.google.com/maps/place/X/@-34.8,-56.2,17z/data=!3d-34.81!4d-56.21' },
    })
    expect([hidden('latitude'), hidden('longitude')]).toEqual(['-34.81', '-56.21'])
    expect(screen.getByRole('status')).toHaveTextContent('Movimos el pin')
  })

  it('keeps a short link and asks to mark the pin by hand', () => {
    renderPicker()
    fireEvent.change(screen.getByLabelText('Link de Google Maps'), { target: { value: 'https://maps.app.goo.gl/AbC' } })
    expect(hidden('latitude')).toBe('')
    expect(screen.getByRole('status')).toHaveTextContent('marcá el pin tocando el mapa')
  })

  it('searches the address once per click, in the club country', async () => {
    const search = renderPicker(vi.fn<(url: string) => Promise<unknown>>(async () => [{ lat: '-34.88', lon: '-56.15' }]))
    await userEvent.type(screen.getByLabelText('Dirección'), 'Av. Italia 1234')
    expect(search).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Buscar en el mapa' }))
    await waitFor(() => expect(hidden('latitude')).toBe('-34.88'))
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0]).toContain('countrycodes=uy')
  })

  it('removes the pin', async () => {
    render(<LocationPicker address="X" pin={{ latitude: 1, longitude: 2 }} googleMapsUrl={null} timezone="America/Montevideo" start={START} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quitar ubicación' }))
    expect(hidden('latitude')).toBe('')
  })
})
