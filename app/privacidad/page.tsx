import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/legal-page'
import { privacyPolicy } from '@/lib/legal/documents'

export const metadata: Metadata = { title: 'Política de privacidad' }

// Public: no session needed.
export default function PrivacyPage() {
  return <LegalPage document={privacyPolicy()} />
}
