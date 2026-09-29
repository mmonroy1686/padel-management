import type { Metadata } from 'next'
import { requireStaff } from '@/lib/auth/viewer'
import { loadMembers } from '@/lib/data/members'
import { setMemberRole, validateCategory } from './actions'
import { MembersList } from './members-list'

export const metadata: Metadata = { title: 'Jugadores' }

export default async function PlayersPage() {
  const viewer = await requireStaff('/club/jugadores')
  const members = await loadMembers(viewer.club.id)

  return (
    <section aria-labelledby="jugadores" className="flex flex-col gap-4">
      <h2 id="jugadores" className="font-display text-2xl font-bold uppercase">
        Jugadores
      </h2>
      <MembersList
        members={members}
        viewerId={viewer.userId}
        canChangeRoles={viewer.membership.role === 'admin'}
        validateAction={validateCategory}
        roleAction={setMemberRole}
      />
    </section>
  )
}
