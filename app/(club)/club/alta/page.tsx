import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/viewer'
import { loadSetupState } from '@/lib/data/club-setup'
import { missingForSetup } from '@/lib/domain/club-setup'

// /club/alta: the first step still missing (courts, then prices), or the first one.
export default async function SetupPage() {
  const { club } = await requireAdmin('/club/alta')
  const [missing] = missingForSetup(await loadSetupState(club.id))
  redirect(`/club/alta/${missing?.step ?? 'canchas'}`)
}
