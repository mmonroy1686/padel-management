import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'

const COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Nombre', sortable: true },
  { key: 'category', label: 'Categoría', sortable: true, align: 'end' },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

const rows: DataRow[] = Array.from({ length: 25 }, (_, index) => {
  const name = index === 0 ? 'Ángel Núñez' : `Jugador ${String(index).padStart(2, '0')}`
  const category = (index % 7) + 1
  return {
    id: String(index),
    cells: { name, category: `${category}ª`, actions: <button type="button">Editar {name}</button> },
    search: name,
    sort: { name, category },
    filters: { category: String(category) },
  }
})

const names = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].lastElementChild?.textContent)

describe('DataTable', () => {
  it('shows a page of rows with the range and moves between pages', async () => {
    render(<DataTable caption="Jugadores" columns={COLUMNS} rows={rows} searchLabel="Buscar jugador" pageSize={10} emptyText="Nadie" />)
    expect(screen.getByRole('table', { name: 'Jugadores' })).toBeInTheDocument()
    expect(names()).toHaveLength(10)
    expect(screen.getByText('1–10 de 25')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(screen.getByText('11–20 de 25')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }))
    expect(screen.getByText('11–20 de 25')).toBeInTheDocument()
  })

  it('searches without accents and goes back to the first page', async () => {
    render(<DataTable caption="Jugadores" columns={COLUMNS} rows={rows} searchLabel="Buscar jugador" pageSize={10} emptyText="Nadie" />)
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar jugador' }), 'angel')
    expect(names()).toEqual(['Ángel Núñez'])
    expect(screen.getByText('1–1 de 1')).toBeInTheDocument()
  })

  it('filters with a select and clears the filters', async () => {
    render(
      <DataTable
        caption="Jugadores"
        columns={COLUMNS}
        rows={rows}
        searchLabel="Buscar jugador"
        filters={[{ key: 'category', label: 'Categoría', options: [{ value: '7', label: '7ª' }] }]}
        emptyText="Nadie"
      />,
    )
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), '7')
    expect(names()).toEqual(['Jugador 06', 'Jugador 13', 'Jugador 20'])
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(names()).toHaveLength(20)
  })

  it('sorts by a column, telling which way', async () => {
    render(<DataTable caption="Jugadores" columns={COLUMNS} rows={rows} searchLabel="Buscar jugador" emptyText="Nadie" />)
    const header = screen.getByRole('columnheader', { name: /Categoría/ })
    expect(header).toHaveAttribute('aria-sort', 'none')
    await userEvent.click(within(header).getByRole('button'))
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(within(header).getByRole('button'))
    expect(header).toHaveAttribute('aria-sort', 'descending')
    expect(names()[0]).toBe('Jugador 06')
  })

  it('says when nothing matches, and when there is nothing at all', async () => {
    const { rerender } = render(
      <DataTable caption="Jugadores" columns={COLUMNS} rows={rows} searchLabel="Buscar jugador" emptyText="Todavía no hay jugadores." />,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar jugador' }), 'zzz')
    expect(screen.getByText('Nadie coincide con la búsqueda o los filtros.')).toBeInTheDocument()
    rerender(<DataTable caption="Jugadores" columns={COLUMNS} rows={[]} searchLabel="Buscar jugador" emptyText="Todavía no hay jugadores." />)
    expect(screen.getByText('Todavía no hay jugadores.')).toBeInTheDocument()
  })
})
