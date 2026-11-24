import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClubInfoView } from '@/lib/domain/club-info'

vi.mock('@/components/club-info/lazy-club-map', () => ({
  LazyClubMap: ({ label }: { label: string }) => <div role="region" aria-label={label} />,
}))

const { ClubSection } = await import('@/components/club-info/club-section')

const FULL: ClubInfoView = {
  photos: ['https://x/1.jpg', 'https://x/2.jpg'],
  address: 'Av. Italia 1234',
  pin: { latitude: -34.9, longitude: -56.1 },
  directions: 'https://maps.app.goo.gl/x',
  contacts: [
    { kind: 'whatsapp', label: 'WhatsApp', href: 'https://wa.me/59892369558?text=Hola', detail: '092 369 558' },
    { kind: 'email', label: 'Email', href: 'mailto:hola@rustic.uy', detail: 'hola@rustic.uy' },
  ],
  amenities: ['Bar', 'Wifi'],
  hours: 'Abierto de 08:00 a 23:00',
}

describe('ClubSection', () => {
  it('shows the photos, the map, the contact buttons and the services', () => {
    render(<ClubSection view={FULL} clubName="Rustic" timezone="America/Montevideo" />)
    expect(screen.getByRole('img', { name: 'Foto 1 de Rustic' })).toHaveAttribute('src', 'https://x/1.jpg')
    expect(screen.getByRole('region', { name: 'Mapa de Rustic' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'WhatsApp: 092 369 558' })).toHaveAttribute('href', 'https://wa.me/59892369558?text=Hola')
    expect(screen.getByRole('link', { name: 'Email: hola@rustic.uy' })).not.toHaveAttribute('target')
    expect(screen.getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute('href', 'https://maps.app.goo.gl/x')
    expect(within(screen.getByRole('list', { name: 'Servicios' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Bar', 'Wifi'])
    expect(screen.getByText('Abierto de 08:00 a 23:00')).toBeInTheDocument()
  })

  it('leaves out what the club did not load', () => {
    render(<ClubSection view={{ ...FULL, photos: [], pin: null, address: null, directions: null, amenities: [] }} clubName="Rustic" timezone="America/Montevideo" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Mapa de Rustic' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Cómo llegar' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Servicios' })).toBeNull()
  })
})
