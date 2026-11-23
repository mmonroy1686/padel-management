import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/legal-page'
import { termsOfService } from '@/lib/legal/documents'

export const metadata: Metadata = { title: 'Términos y condiciones' }

// Public: no session needed.
export default function TermsPage() {
  return <LegalPage document={termsOfService()} />
}
