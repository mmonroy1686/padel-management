import { ROLE_LABELS } from '@/lib/domain/profile'
import type { EmailMessage } from './email'
import { brandedEmail, type EmailUrls } from './messages'

// One staff invitation waiting to be mailed, as claim_invitation_emails returns it.
export type PendingInvitation = {
  id: string
  email: string
  role: 'admin' | 'reception'
  // Null when the admin who invited no longer has an account.
  inviterName: string | null
  clubName: string
  clubLogoPath: string | null
  clubPrimary: string
  clubBackground: string
  clubSlug: string
}

// The invitation mail: who invites, as what, and the button to /invitacion on the club's subdomain, where signing in
// with this same email accepts it.
export function buildInvitationEmail(item: PendingInvitation, urls: EmailUrls): EmailMessage {
  const role = ROLE_LABELS[item.role].toLowerCase()
  const who = item.inviterName ? `${item.inviterName} te invitó` : 'Te invitaron'
  return brandedEmail(
    {
      to: item.email,
      club: { name: item.clubName, logoPath: item.clubLogoPath, primary: item.clubPrimary, background: item.clubBackground },
      greeting: 'Hola:',
      title: `Te invitaron a ${item.clubName} como ${role}`,
      body: `${who} a ser parte del staff de ${item.clubName}. Entrá con este email (${item.email}) para aceptar; la invitación vence en 7 días.`,
      button: 'Aceptar invitación',
      link: `${urls.clubUrl(item.clubSlug)}/invitacion`,
      footer: `${item.clubName}: te llegó porque un admin del club te invitó. Si no esperabas este mail, ignoralo.`,
    },
    urls.supabaseUrl,
  )
}
