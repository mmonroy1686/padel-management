import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentsSection, SummaryTile } from '@/app/(club)/club/cobros/payments-section'

describe('PaymentsSection', () => {
  it('shows the count and money next to the title and lists the items', () => {
    render(
      <PaymentsSection id="sin-pagar" icon="clock" tone="accent" title="Sin pagar" hint="Últimos 30 días."
        totals={{ count: 2, total: 2800 }} emptyText="Nada pendiente.">
        <li>Martina</li>
      </PaymentsSection>,
    )
    expect(screen.getByRole('region', { name: 'Sin pagar' })).toBeInTheDocument()
    expect(screen.getByText('2 · $2.800')).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Martina')
  })

  it('shows an all-clear when the list is empty', () => {
    render(
      <PaymentsSection id="devolver" icon="undo" tone="danger" title="A devolver" hint="Pagos de cancelaciones."
        totals={{ count: 0, total: 0 }} emptyText="No hay devoluciones pendientes.">
        {null}
      </PaymentsSection>,
    )
    expect(screen.getByText('No hay devoluciones pendientes.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('SummaryTile', () => {
  it('links to its list and says how much is pending', () => {
    render(<SummaryTile href="#sin-pagar" label="Sin cobrar" totals={{ count: 1, total: 1600 }} tone="accent" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '#sin-pagar')
    expect(link).toHaveTextContent('Sin cobrar$1.6001 pendiente')
  })

  it('says it is up to date when nothing is pending', () => {
    render(<SummaryTile href="#devolver" label="A devolver" totals={{ count: 0, total: 0 }} tone="danger" />)
    expect(screen.getByRole('link')).toHaveTextContent('Al día')
  })
})
