import type { Metadata } from 'next'
import { SettingsBlock, SettingsHeader } from '@/components/settings/settings-block'
import { ActionForm } from '@/components/ui/action-form'
import { ShareButton } from '@/components/ui/share-button'
import { requestOrigin } from '@/lib/auth/request-origin'
import { requireAdmin } from '@/lib/auth/viewer'
import { loadStaff } from '@/lib/data/staff'
import {
  invitationShareText,
  invitationStatus,
  STAFF_ROLE_LABELS,
  staffName,
} from '@/lib/domain/staff'
import { InviteStaffForm } from '../forms'
import { cancelInvitation, changeStaffRole, removeStaff, resendInvitation } from './actions'

export const metadata: Metadata = { title: 'Ajustes · Staff' }

// Ajustes → Staff: who runs the club (admins and reception), the open invitations and a form to invite.
export default async function StaffSettingsPage() {
  const viewer = await requireAdmin('/club/ajustes/staff')
  const { club } = viewer
  const [{ members, invitations }, origin] = await Promise.all([loadStaff(club.id), requestOrigin()])
  const now = new Date()

  return (
    <>
      <SettingsHeader href="/club/ajustes/staff" />
      <SettingsBlock
        id="invitar"
        title="Invitar"
        description="Le llega un mail con un link. Entra con ese email y queda en el panel, sin completar el perfil de jugador. La invitación vence en 7 días."
      >
        <InviteStaffForm />
      </SettingsBlock>

      {invitations.length > 0 ? (
        <SettingsBlock id="invitaciones" title="Invitaciones abiertas" description="Todavía no entraron con el link.">
          <ul className="flex flex-col divide-y divide-border" aria-label="Invitaciones abiertas">
            {invitations.map((invitation) => {
              const status = invitationStatus(invitation, now, club.timezone)
              return (
                <li key={invitation.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="break-all font-semibold">{invitation.email}</p>
                    <p className="text-sm text-fg-muted">
                      {STAFF_ROLE_LABELS[invitation.role]} · {status.text}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <ActionForm action={resendInvitation} submitLabel="Reenviar" pendingLabel="Reenviando…" variant="secondary" size="sm"
                      accessibleLabel={`Reenviar la invitación de ${invitation.email}`}>
                      <input type="hidden" name="invitationId" value={invitation.id} />
                    </ActionForm>
                    {status.expired ? null : (
                      <ShareButton
                        title={`Invitación a ${club.name}`}
                        text={invitationShareText(club.name, invitation.email, origin)}
                        label="Compartir link"
                        size="sm"
                      />
                    )}
                    <ActionForm action={cancelInvitation} submitLabel="Cancelar" pendingLabel="Cancelando…" variant="ghost" size="sm"
                      accessibleLabel={`Cancelar la invitación de ${invitation.email}`}>
                      <input type="hidden" name="invitationId" value={invitation.id} />
                    </ActionForm>
                  </div>
                </li>
              )
            })}
          </ul>
        </SettingsBlock>
      ) : null}

      <SettingsBlock
        id="staff"
        title="Staff"
        description="Admin ve y cambia todo, Ajustes incluido. Recepción maneja la grilla, los cobros y el día a día. El club siempre tiene al menos un admin."
      >
        <ul className="flex flex-col divide-y divide-border" aria-label="Staff del club">
          {members.map((member) => {
            const name = staffName(member)
            const other = member.role === 'admin' ? 'reception' : 'admin'
            const isYou = member.userId === viewer.userId
            return (
              <li key={member.userId} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-semibold">
                    {name}
                    {isYou ? <span className="font-normal text-fg-muted"> (vos)</span> : null}
                  </p>
                  <p className="break-all text-sm text-fg-muted">
                    {member.support ? 'Soporte de la plataforma' : STAFF_ROLE_LABELS[member.role]}
                    {name === member.email ? null : ` · ${member.email}`}
                  </p>
                </div>
                {/* Support comes and goes from the platform: the club does not change its role. */}
                {member.support ? null : (
                <div className="flex flex-wrap items-start gap-2">
                  <ActionForm action={changeStaffRole} submitLabel={`Pasar a ${STAFF_ROLE_LABELS[other].toLowerCase()}`}
                    pendingLabel="Cambiando…" variant="secondary" size="sm"
                    accessibleLabel={`Pasar a ${name} a ${STAFF_ROLE_LABELS[other].toLowerCase()}`}>
                    <input type="hidden" name="userId" value={member.userId} />
                    <input type="hidden" name="role" value={other} />
                  </ActionForm>
                  <ActionForm action={removeStaff} submitLabel="Quitar acceso" pendingLabel="Quitando…" variant="danger" confirmLabel="¿Seguro? Tocá de nuevo" size="sm"
                    accessibleLabel={`Quitarle el acceso a ${name}`}>
                    <input type="hidden" name="userId" value={member.userId} />
                  </ActionForm>
                </div>
                )}
              </li>
            )
          })}
        </ul>
      </SettingsBlock>
    </>
  )
}
