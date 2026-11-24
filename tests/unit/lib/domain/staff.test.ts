import { describe, expect, it } from 'vitest'
import {
  invitationShareText,
  invitationStatus,
  parseInviteForm,
  staffName,
  STAFF_ROLE_LABELS,
  type StaffInvitation,
} from '@/lib/domain/staff'

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

describe('parseInviteForm', () => {
  it('takes the email trimmed and in lower case, and the role', () => {
    expect(parseInviteForm(form({ email: '  Recepcion@Club.UY ', role: 'reception' }))).toEqual({
      ok: true,
      value: { email: 'recepcion@club.uy', role: 'reception' },
    })
  })

  it('explains a wrong email or a missing role', () => {
    expect(parseInviteForm(form({ email: 'recepcion', role: 'admin' }))).toEqual({
      ok: false,
      message: 'Revisá el email: tiene que ser como nombre@dominio.com.',
    })
    expect(parseInviteForm(form({ email: 'a@b.uy', role: 'player' }))).toEqual({
      ok: false,
      message: 'Elegí si es admin o recepción.',
    })
  })
})

describe('staffName', () => {
  it('uses the name, or the email while there is none', () => {
    expect(staffName({ displayName: 'Carla Recepción', email: 'carla@test.local' })).toBe('Carla Recepción')
    expect(staffName({ displayName: '  ', email: 'carla@test.local' })).toBe('carla@test.local')
  })
})

describe('invitationStatus', () => {
  const invitation: StaffInvitation = {
    id: 'i1',
    email: 'carla@test.local',
    role: 'reception',
    expiresAt: new Date('2026-12-01T15:00:00Z'),
  }

  it('says until when it is open, in the club time zone', () => {
    expect(invitationStatus(invitation, new Date('2026-11-24T12:00:00Z'), 'America/Montevideo')).toEqual({
      expired: false,
      text: 'Vence el 1/12',
    })
  })

  it('says when it expired', () => {
    expect(invitationStatus(invitation, new Date('2026-12-01T15:00:00Z'), 'America/Montevideo')).toEqual({
      expired: true,
      text: 'Vencida: reenviala para darle 7 días más',
    })
  })
})

describe('invitationShareText', () => {
  it('tells who it is for and where to accept it', () => {
    expect(invitationShareText('Rustic Pádel', 'carla@test.local', 'https://rustic.test')).toBe(
      'Te invitamos al staff de Rustic Pádel. Entrá con carla@test.local acá para aceptar: https://rustic.test/invitacion',
    )
  })
})

describe('STAFF_ROLE_LABELS', () => {
  it('names the two staff roles', () => {
    expect(STAFF_ROLE_LABELS).toEqual({ admin: 'Admin', reception: 'Recepción' })
  })
})
