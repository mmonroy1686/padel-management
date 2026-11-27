import type { PlatformClub } from '@/lib/domain/platform'

// A club on /plataforma: set up, in its trial, no milestone past the first reservations.
export function platformClub(overrides: Partial<PlatformClub> = {}): PlatformClub {
  return {
    id: 'c1',
    slug: 'rustic',
    name: 'Rustic Pádel',
    timezone: 'America/Montevideo',
    createdAt: new Date('2026-09-01T12:00:00Z'),
    setupCompletedAt: new Date('2026-09-02T12:00:00Z'),
    activeCourts: 3,
    staff: 2,
    adminInvitationExpiresAt: null,
    bookingsLastWeek: 41,
    onlineLastWeek: 10,
    lastBookingAt: new Date('2026-11-24T10:00:00Z'),
    players: 12,
    status: 'trial',
    trialEndsOn: '2027-01-26',
    isSupport: false,
    milestones: {
      courtsAndPrices: new Date('2026-09-01T13:00:00Z'),
      receptionJoined: new Date('2026-09-03T13:00:00Z'),
      firstReceptionBooking: new Date('2026-09-04T13:00:00Z'),
      firstOnlineBooking: new Date('2026-09-05T13:00:00Z'),
      twentiethPlayer: null,
      firstPayment: null,
      firstMatch: null,
      firstTournament: null,
      firstDayUse: null,
    },
    ...overrides,
  }
}
