import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotificationList } from '@/components/waitlist/notification-list'
import type { NotificationView } from '@/lib/domain/waitlist'

const ITEMS: NotificationView[] = [
  {
    id: 'n1',
    title: 'Se liberó tu turno: sáb 3, 19:00, Cancha 2',
    body: 'Te lo guardamos hasta las 17:42. Reservalo desde Inicio antes de que pase al siguiente de la lista.',
    link: '/',
    createdAt: new Date('2026-10-03T20:27:00Z'),
    unread: true,
  },
  {
    id: 'n2',
    title: 'Se liberó la Cancha 1 a las 21:30: el primero que reserva se la queda',
    body: 'Falta poco para el turno, así que no se guarda para nadie. Si lo querés, reservalo ya.',
    link: '/reservar?dia=2026-10-02',
    createdAt: new Date('2026-10-02T23:50:00Z'),
    unread: false,
  },
]

describe('NotificationList', () => {
  it('lists each aviso with its link, when it came and whether it is new', () => {
    render(<NotificationList items={ITEMS} timezone="America/Montevideo" today="2026-10-03" />)
    const links = within(screen.getByRole('list', { name: 'Tus avisos' })).getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/')
    expect(links[0]).toHaveTextContent('Se liberó tu turno: sáb 3, 19:00, Cancha 2')
    expect(links[0]).toHaveTextContent('Nuevo')
    expect(links[0]).toHaveTextContent('Hoy 17:27')
    expect(links[1]).toHaveAttribute('href', '/reservar?dia=2026-10-02')
    expect(links[1]).not.toHaveTextContent('Nuevo')
    expect(links[1]).toHaveTextContent('vie 2 20:50')
  })

  it('explains what will show up here when there is nothing', () => {
    render(<NotificationList items={[]} timezone="America/Montevideo" today="2026-10-03" />)
    expect(screen.getByText(/No tenés avisos/)).toBeInTheDocument()
  })
})
