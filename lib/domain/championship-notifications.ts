// The avisos of a championship. The database writes them (private.notify_championship_entry); the app
// shows them in /avisos and mails them with the same words.

export const CHAMPIONSHIP_NOTIFICATION_KINDS = [
  'championship_added',
  'championship_promoted',
  'championship_moved',
  'championship_cancelled',
  'championship_fixture',
] as const
export type ChampionshipNotificationKind = (typeof CHAMPIONSHIP_NOTIFICATION_KINDS)[number]

export type ChampionshipNotificationData = {
  championshipName: string
  // null when the whole championship was cancelled.
  categoryName: string | null
  partnerName: string | null
  waiting: boolean
  // The first match; null for a championship with no days of play.
  startsAt: Date | null
}

export function isChampionshipNotificationKind(kind: string): kind is ChampionshipNotificationKind {
  return (CHAMPIONSHIP_NOTIFICATION_KINDS as readonly string[]).includes(kind)
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

// The jsonb private.championship_notice_data writes; anything else reads as null.
export function readChampionshipNotificationData(data: unknown): ChampionshipNotificationData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Record<string, unknown>
  const championshipName = readText(record.championship_name)
  if (!championshipName) return null
  const startsAt = typeof record.starts_at === 'string' ? new Date(record.starts_at) : null
  return {
    championshipName,
    categoryName: readText(record.category_name),
    partnerName: readText(record.partner_name),
    waiting: record.waiting === true,
    startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
  }
}

export function championshipNotificationText(
  kind: ChampionshipNotificationKind,
  data: ChampionshipNotificationData,
): { title: string; body: string } {
  const where = data.categoryName ?? data.championshipName
  const withPartner = data.partnerName ? `, con ${data.partnerName}` : ''
  switch (kind) {
    case 'championship_added':
      return {
        title: `Te anotaron con ${data.partnerName ?? 'tu compañero'} en ${where}`,
        body: `${data.championshipName}. ${data.waiting ? 'Quedaron en la lista de espera: si se libera un lugar, entran solos. ' : ''}Si no podés jugar, date de baja desde el campeonato.`,
      }
    case 'championship_promoted':
      return {
        title: `Entraste a ${where} desde la lista de espera`,
        body: `${data.championshipName}${withPartner}. Ya tienen lugar: paguen la inscripción desde el campeonato.`,
      }
    case 'championship_moved':
      return {
        title: `Tu pareja pasó a ${where}`,
        body: `${data.championshipName}${withPartner}. El club cambió la categoría.${data.waiting ? ' Quedaron en la lista de espera.' : ''}`,
      }
    case 'championship_cancelled':
      return {
        title: `Se canceló ${where}`,
        body: `${data.categoryName ? `${data.championshipName}. ` : ''}Si ya pagaste, el club te devuelve la plata.`,
      }
    case 'championship_fixture':
      return {
        title: `Ya está el fixture de ${data.championshipName}`,
        body: `${where}${withPartner}. Mirá tus partidos, canchas y horarios en el campeonato.`,
      }
  }
}
