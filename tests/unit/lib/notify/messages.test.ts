// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildEmail, type PendingEmail } from '@/lib/notify/messages'

// Saturday 2026-10-03: 22:00 UTC is 19:00 in Montevideo; 20:42 UTC is 17:42.
const HELD: PendingEmail = {
  id: 'n1',
  kind: 'slot_held',
  data: { court_name: 'Cancha 2', starts_at: '2026-10-03T22:00:00Z', expires_at: '2026-10-03T20:42:00Z' },
  link: '/',
  email: 'ana@test.local',
  playerName: 'Ana Pérez',
  clubName: 'Rustic Pádel',
  clubTimezone: 'America/Montevideo',
  clubLogoPath: 'club-1/logo-1.png',
}
const URLS = { siteUrl: 'https://rustic.test', supabaseUrl: 'https://db.test' }

describe('buildEmail', () => {
  it('mails a held slot in castellano, with the logo, the colors and the link', () => {
    const mail = buildEmail(HELD, URLS)!
    expect(mail.to).toBe('ana@test.local')
    expect(mail.subject).toBe('Se liberó tu turno: sáb 3, 19:00, Cancha 2')
    expect(mail.text).toContain('Hola, Ana:')
    expect(mail.text).toContain('Te lo guardamos hasta las 17:42.')
    expect(mail.text).toContain('Reservar ahora: https://rustic.test/')
    expect(mail.html).toContain('src="https://db.test/storage/v1/object/public/club-logos/club-1/logo-1.png"')
    expect(mail.html).toContain('#FCB021')
    expect(mail.html).toContain('href="https://rustic.test/"')
  })

  it('mails a slot free right now with the link to that day', () => {
    const mail = buildEmail({ ...HELD, kind: 'slot_free_now', link: '/reservar?dia=2026-10-03', clubLogoPath: null }, URLS)!
    expect(mail.subject).toBe('Se liberó la Cancha 2 a las 19:00: el primero que reserva se la queda')
    expect(mail.html).toContain('href="https://rustic.test/reservar?dia=2026-10-03"')
    expect(mail.html).toContain('Ver el turno')
    expect(mail.html).not.toContain('<img')
    expect(mail.html).toContain('Rustic Pádel')
  })

  it('escapes what people typed', () => {
    const mail = buildEmail({ ...HELD, playerName: '<b>Ana</b>' }, URLS)!
    expect(mail.html).toContain('&lt;b&gt;Ana&lt;/b&gt;')
    expect(mail.html).not.toContain('<b>Ana')
  })

  it('builds nothing without an address or with data it cannot read', () => {
    expect(buildEmail({ ...HELD, email: null }, URLS)).toBeNull()
    expect(buildEmail({ ...HELD, data: {} }, URLS)).toBeNull()
  })

  it('mails an aviso of a championship with its own button and reason', () => {
    const mail = buildEmail(
      {
        ...HELD,
        kind: 'championship_added',
        data: {
          championship_id: 'ch1',
          championship_name: 'Campeonato de Primavera',
          category_name: '6ta Libre',
          partner_name: 'Bruno',
          waiting: false,
          starts_at: '2026-10-17T11:00:00Z',
        },
        link: '/campeonatos/ch1',
      },
      URLS,
    )!
    expect(mail.subject).toBe('Te anotaron con Bruno en 6ta Libre')
    expect(mail.text).toContain('Ver el campeonato: https://rustic.test/campeonatos/ch1')
    expect(mail.text).toContain('Rustic Pádel: te escribimos por tu inscripción en un campeonato.')
  })
})
