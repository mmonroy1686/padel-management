import { clubLogoUrl } from '@/lib/domain/club-logo'
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
}

// Rustic's colors (app/globals.css, dark mode): the club does not store its own yet.
const COLORS = {
  background: '#021716',
  surface: '#0A2624',
  text: '#FFFFFF',
  muted: '#B8C4C3',
  accent: '#FCB021',
  onAccent: '#000000',
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
export function buildEmail(item: PendingEmail, urls: { siteUrl: string; supabaseUrl: string }): EmailMessage | null {
  const content = notificationContent(item.kind, item.data, item.clubTimezone)
  if (!item.email || !content) return null
  const { title, body, button } = content
  const link = `${urls.siteUrl}${item.link}`
  const logo = clubLogoUrl(urls.supabaseUrl, item.clubLogoPath)
  const greeting = `Hola, ${firstName(item.playerName)}:`
  const footer = `${item.clubName}: ${content.reason}`
  const brand = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(item.clubName)}" width="56" height="56" style="display:block;border-radius:12px;margin:0 0 16px">`
    : `<p style="margin:0 0 16px;font-weight:bold;color:${COLORS.accent}">${escapeHtml(item.clubName)}</p>`
  const html = [
    '<!doctype html>',
    `<html lang="es"><body style="margin:0;background:${COLORS.background};font-family:Arial,Helvetica,sans-serif;color:${COLORS.text}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.background}"><tr><td align="center" style="padding:24px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${COLORS.surface};border-radius:16px"><tr><td style="padding:24px">`,
    brand,
    `<p style="margin:0 0 8px;color:${COLORS.muted}">${escapeHtml(greeting)}</p>`,
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${COLORS.text}">${escapeHtml(title)}</h1>`,
    `<p style="margin:0 0 20px;line-height:1.5;color:${COLORS.muted}">${escapeHtml(body)}</p>`,
    `<a href="${escapeHtml(link)}" style="display:inline-block;background:${COLORS.accent};color:${COLORS.onAccent};font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:12px">${button}</a>`,
    '</td></tr></table>',
    `<p style="margin:16px 0 0;font-size:12px;color:${COLORS.muted}">${escapeHtml(footer)}</p>`,
    '</td></tr></table></body></html>',
  ].join('')

  const text = `${greeting}\n\n${title}.\n${body}\n\n${button}: ${link}\n\n${footer}`
  return { to: item.email, subject: title, html, text }
}
