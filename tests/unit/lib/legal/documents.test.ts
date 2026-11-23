import { describe, expect, it } from 'vitest'
import { gapsIn, privacyPolicy, productName, termsOfService } from '@/lib/legal/documents'

describe('legal documents', () => {
  it('names the product from the environment, or leaves a visible gap', () => {
    expect(productName({ NEXT_PUBLIC_PRODUCT_NAME: 'Pique' })).toBe('Pique')
    expect(productName({})).toBe('[COMPLETAR: nombre del producto]')
  })

  it('lists every gap still to fill, once', () => {
    const gaps = gapsIn(termsOfService('Pique'))
    expect(gaps).toEqual(
      expect.arrayContaining(['[COMPLETAR: razón social]', '[COMPLETAR: RUT]', '[COMPLETAR: email de contacto]', '[COMPLETAR: departamento]']),
    )
    expect(new Set(gaps).size).toBe(gaps.length)
    expect(gaps).not.toContain('[COMPLETAR: nombre del producto]')
  })

  it('the privacy policy names the law, the rights and the providers', () => {
    const text = JSON.stringify(privacyPolicy('Pique'))
    expect(text).toContain('Ley N° 18.331')
    expect(text).toContain('URCDP')
    for (const provider of ['Supabase', 'Vercel', 'Resend', 'Sentry']) expect(text).toContain(provider)
  })
})
