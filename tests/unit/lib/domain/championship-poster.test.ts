import { describe, expect, it } from 'vitest'
import { checkPosterFile, championshipPosterUrl, isPosterPath, posterPath } from '@/lib/domain/championship-poster'

const CLUB = '11111111-1111-1111-1111-111111111111'

describe('the poster', () => {
  it('goes in the club folder, named by the time it was uploaded', () => {
    expect(posterPath(CLUB, 'Afiche Final.JPEG', 1_760_000_000_000)).toBe(`${CLUB}/poster-1760000000000.jpeg`)
    expect(posterPath(CLUB, 'sin-extension', 1)).toBe(`${CLUB}/poster-1.png`)
  })

  it('accepts only a poster of that club, as posterPath names it', () => {
    expect(isPosterPath(CLUB, `${CLUB}/poster-1760000000000.webp`)).toBe(true)
    expect(isPosterPath(CLUB, `otro-club/poster-1.png`)).toBe(false)
    expect(isPosterPath(CLUB, `${CLUB}/logo-1.png`)).toBe(false)
    expect(isPosterPath(CLUB, `${CLUB}/a/poster-1.png`)).toBe(false)
  })

  it('takes images up to 5 MB', () => {
    expect(checkPosterFile({ type: 'image/png', size: 1_000_000 })).toBeNull()
    expect(checkPosterFile({ type: 'application/pdf', size: 1_000 })).toBe('Subí una imagen PNG, JPG o WebP.')
    expect(checkPosterFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toBe('El afiche pesa más de 5 MB. Probá con una versión más liviana.')
  })

  it('is public', () => {
    expect(championshipPosterUrl('https://db.test', `${CLUB}/poster-1.png`)).toBe(
      `https://db.test/storage/v1/object/public/championship-posters/${CLUB}/poster-1.png`,
    )
    expect(championshipPosterUrl('https://db.test', null)).toBeNull()
  })
})
