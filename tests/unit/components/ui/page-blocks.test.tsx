import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingNextSteps } from '@/components/booking/booking-next-steps'
import { HeroAction } from '@/components/ui/hero-action'
import { EmptyLine, PageSection } from '@/components/ui/page-section'
import { RowLink, RowList } from '@/components/ui/row-list'

describe('HeroAction', () => {
  it('is one big link with its title and detail', () => {
    render(<HeroAction href="/reservar" icon="calendar-plus" title="Reservar cancha" detail="10 turnos libres hoy" />)
    expect(screen.getByRole('link', { name: /^Reservar cancha,\s*10 turnos libres hoy$/ })).toHaveAttribute('href', '/reservar')
  })
})

describe('PageSection', () => {
  it('is a region named by its title, with an optional link to see more', () => {
    render(
      <PageSection id="para-vos" title="Partidos para vos" more={{ href: '/partidos', label: 'Ver todos' }}>
        <EmptyLine action={{ href: '/partidos', label: 'Armá uno' }}>No hay partidos.</EmptyLine>
      </PageSection>,
    )
    const region = screen.getByRole('region', { name: 'Partidos para vos' })
    expect(region).toHaveTextContent('No hay partidos. Armá uno')
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/partidos')
  })
})

describe('RowList', () => {
  it('lists rows that are links as a whole', () => {
    render(
      <RowList label="Partidos">
        <RowLink href="/partidos/1" title="Hoy 20:00" detail="Faltan 2" />
      </RowList>,
    )
    expect(screen.getByRole('list', { name: 'Partidos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Hoy 20:00,\s*Faltan 2$/ })).toHaveAttribute('href', '/partidos/1')
  })
})

describe('BookingNextSteps', () => {
  it('shows how to pay and copies the transfer details', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<BookingNextSteps paymentNote="Se paga en el club o por transferencia." transferDetails="Alias: rustic.padel" />)
    expect(screen.getByText('Alias: rustic.padel')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copiar datos' }))
    expect(writeText).toHaveBeenCalledWith('Alias: rustic.padel')
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver tu reserva en Inicio' })).toHaveAttribute('href', '/')
  })

  it('without transfer details, only how to pay', () => {
    render(<BookingNextSteps paymentNote="Se paga en el club." transferDetails={null} />)
    expect(screen.queryByRole('button', { name: 'Copiar datos' })).not.toBeInTheDocument()
  })
})
