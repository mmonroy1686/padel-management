import { clubLogoUrl } from '@/lib/domain/club-logo'
import { clubTheme } from '@/lib/domain/club-theme'
import { notificationContent, type NotificationKind } from '@/lib/domain/notifications'
import { firstName } from '@/lib/domain/profile'
import type { EmailMessage } from './email'

// One aviso waiting to be mailed, as claim_notification_emails returns it.
export type PendingEmail = {
  id: string
  kind: NotificationKind
  data: unknown
  link: string
  email: string | null
  playerName: string
  clubName: string
  clubTimezone: string
  clubLogoPath: string | null
  clubPrimary: string
  clubBackground: string
  // The club's subdomain: the email's button opens the app there.
  clubSlug: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// The mail for one aviso: the same words as /avisos, the club's logo and a button to the app.
// null when it cannot be built (no address, data it cannot read).
export type EmailUrls = { clubUrl: (slug: string) => string; supabaseUrl: string }

export function buildEmail(item: PendingEmail, urls: EmailUrls): EmailMessage | null {
  const content = notificationContent(item.kind, item.data, item.clubTimezone)
  if (!item.email || !content) return null
  return brandedEmail(
    {
      to: item.email,
      club: { name: item.clubName, logoPath: item.clubLogoPath, primary: item.clubPrimary, background: item.clubBackground },
      greeting: `Hola, ${firstName(item.playerName)}:`,
      title: content.title,
      body: content.body,
      button: content.button,
      link: `${urls.clubUrl(item.clubSlug)}${item.link}`,
      footer: `${item.clubName}: ${content.reason}`,
    },
    urls.supabaseUrl,
  )
}

export type EmailClub = { name: string; logoPath: string | null; primary: string; background: string }
export type BrandedEmail = {
  to: string
  club: EmailClub
  greeting: string
  title: string
  body: string
  button: string
  link: string
  footer: string
}

// Every mail the app sends: the club's logo (or its name), a title, a line, one button and why it came.
export function brandedEmail(mail: BrandedEmail, supabaseUrl: string): EmailMessage {
  const { club, greeting, title, body, button, link, footer } = mail
  const logo = clubLogoUrl(supabaseUrl, club.logoPath)
  // The club's dark palette, always: mail apps ignore the device's mode in a mail's own colors.
  const colors = clubTheme({ primary: club.primary, background: club.background }).dark
  const brand = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(club.name)}" width="56" height="56" style="display:block;border-radius:12px;margin:0 0 16px">`
    : `<p style="margin:0 0 16px;font-weight:bold;color:${colors['accent-ink']}">${escapeHtml(club.name)}</p>`
  const html = [
    '<!doctype html>',
    `<html lang="es"><body style="margin:0;background:${colors.bg};font-family:Arial,Helvetica,sans-serif;color:${colors.fg}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg}"><tr><td align="center" style="padding:24px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${colors.surface};border-radius:16px"><tr><td style="padding:24px">`,
    brand,
    `<p style="margin:0 0 8px;color:${colors['fg-muted']}">${escapeHtml(greeting)}</p>`,
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${colors.fg}">${escapeHtml(title)}</h1>`,
    `<p style="margin:0 0 20px;line-height:1.5;color:${colors['fg-muted']}">${escapeHtml(body)}</p>`,
    `<a href="${escapeHtml(link)}" style="display:inline-block;background:${colors.accent};color:${colors['on-accent']};font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:12px">${escapeHtml(button)}</a>`,
    '</td></tr></table>',
    `<p style="margin:16px 0 0;font-size:12px;color:${colors['fg-muted']}">${escapeHtml(footer)}</p>`,
    '</td></tr></table></body></html>',
  ].join('')

  const text = `${greeting}\n\n${title}.\n${body}\n\n${button}: ${link}\n\n${footer}`
  return { to: mail.to, subject: title, html, text }
}
