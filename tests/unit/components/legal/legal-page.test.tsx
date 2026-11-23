import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LegalLinks } from '@/components/legal/legal-links'
import { LegalPage } from '@/components/legal/legal-page'
import type { LegalDocument } from '@/lib/legal/documents'

const DRAFT: LegalDocument = {
  title: 'Política de privacidad',
  updated: '[COMPLETAR: fecha de vigencia]',
  intro: 'La ofrece [COMPLETAR: razón social].',
  sections: [{ title: 'Qué datos usamos', paragraphs: ['Los que nos das:'], items: ['Tu nombre y tu email.'] }],
}

describe('LegalPage', () => {
  it('says it is a draft while gaps remain, and highlights them', () => {
    const { container } = render(<LegalPage document={DRAFT} />)
    expect(screen.getByRole('note')).toHaveTextContent('Borrador. Este texto todavía no es definitivo: faltan 2 datos')
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      '[COMPLETAR: fecha de vigencia]',
      '[COMPLETAR: razón social]',
    ])
    expect(screen.getByRole('heading', { name: 'Qué datos usamos' })).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Tu nombre y tu email.')
  })

  it('drops the draft banner once everything is filled', () => {
    render(<LegalPage document={{ ...DRAFT, updated: '1 de diciembre de 2026', intro: 'La ofrece Pique S.A.S.' }} />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

describe('LegalLinks', () => {
  it('links the terms and the privacy policy', () => {
    render(<LegalLinks />)
    expect(screen.getByRole('link', { name: 'Términos y condiciones' })).toHaveAttribute('href', '/terminos')
    expect(screen.getByRole('link', { name: 'Política de privacidad' })).toHaveAttribute('href', '/privacidad')
  })
})
