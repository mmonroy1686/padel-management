import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { FileField } from '@/components/ui/file-field'

function Picker() {
  const ref = useRef<HTMLInputElement>(null)
  return <FileField id="logo" name="logo" label="Archivo del logo" accept="image/png" inputRef={ref} />
}

describe('FileField', () => {
  it('opens the picker from a Spanish button and names the chosen file', async () => {
    render(<Picker />)
    expect(screen.getByRole('button', { name: 'Elegir archivo' })).toBeInTheDocument()
    expect(screen.getByText('Ningún archivo elegido')).toBeInTheDocument()
    await userEvent.upload(screen.getByLabelText('Archivo del logo'), new File(['x'], 'rustic.png', { type: 'image/png' }))
    expect(screen.getByText('rustic.png')).toBeInTheDocument()
  })
})
