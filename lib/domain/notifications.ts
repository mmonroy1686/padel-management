import {
  championshipNotificationText,
  isChampionshipNotificationKind,
  readChampionshipNotificationData,
  type ChampionshipNotificationKind,
} from './championship-notifications'
import { notificationText, readNotificationData, type NotificationKind as WaitlistNotificationKind } from './waitlist'

// Every aviso the app shows in /avisos and mails: the waitlist's and the championships'.
export type NotificationKind = WaitlistNotificationKind | ChampionshipNotificationKind
export type NotificationContent = { title: string; body: string; button: string; reason: string }
export type NotificationRow = {
  id: string
  kind: NotificationKind
  data: unknown
  link: string
  created_at: string
  read_at: string | null
}
export type NotificationView = { id: string; title: string; body: string; link: string; createdAt: Date; unread: boolean }

// The same words in /avisos and in the mail, plus the mail's button and why we wrote. null when the data
// cannot be read.
export function notificationContent(kind: NotificationKind, data: unknown, timezone: string): NotificationContent | null {
  if (isChampionshipNotificationKind(kind)) {
    const read = readChampionshipNotificationData(data)
    if (!read) return null
    return {
      ...championshipNotificationText(kind, read),
      button: 'Ver el campeonato',
      reason: 'te escribimos por tu inscripción en un campeonato.',
    }
  }
  const read = readNotificationData(data)
  if (!read) return null
  return {
    ...notificationText(kind, read, timezone),
    button: kind === 'slot_held' ? 'Reservar ahora' : 'Ver el turno',
    reason: 'te escribimos porque te anotaste en la lista de espera.',
  }
}

// Too late to mail: the hold ran out, the slot or the championship already started.
export function isNotificationStale(kind: NotificationKind, data: unknown, now: Date): boolean {
  if (isChampionshipNotificationKind(kind)) {
    const read = readChampionshipNotificationData(data)
    if (!read) return true
    return read.startsAt !== null && read.startsAt.getTime() <= now.getTime()
  }
  const read = readNotificationData(data)
  if (!read) return true
  const deadline = kind === 'slot_held' ? read.expiresAt : read.startsAt
  return !deadline || deadline.getTime() <= now.getTime()
}

export function toNotificationView(row: NotificationRow, timezone: string): NotificationView | null {
  const content = notificationContent(row.kind, row.data, timezone)
  if (!content) return null
  return {
    id: row.id,
    title: content.title,
    body: content.body,
    link: row.link,
    createdAt: new Date(row.created_at),
    unread: row.read_at === null,
  }
}
