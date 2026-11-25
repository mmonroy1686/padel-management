import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Condensed } from 'next/font/google'
import { ActivityProvider } from '@/components/ui/activity'
import { requestOrigin } from '@/lib/auth/request-origin'
import { findClub } from '@/lib/auth/viewer'
import { brandOrDefault, brandViewport, NO_CLUB_NAME } from '@/lib/domain/club-brand'
import { clubTheme, themeCss } from '@/lib/domain/club-theme'
import './globals.css'

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-barlow',
  display: 'swap',
})

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-barlow-condensed',
  display: 'swap',
})

// Around every page; with no club on the host it renders the default brand and the page says "Club no encontrado".
export async function generateMetadata(): Promise<Metadata> {
  const name = (await findClub())?.name ?? NO_CLUB_NAME
  const description = `Reservá cancha y armá partido en ${name}.`
  return {
    metadataBase: new URL(await requestOrigin()),
    title: { default: name, template: `%s · ${name}` },
    description,
    openGraph: { title: name, description, siteName: name, locale: 'es_UY', type: 'website' },
  }
}

export async function generateViewport(): Promise<Viewport> {
  const club = await findClub()
  // cover: the page reaches under the notch and the home bar, and env(safe-area-inset-*) (header, bottom bar, sheet)
  // pads what must stay clear.
  return { width: 'device-width', initialScale: 1, viewportFit: 'cover', ...brandViewport(brandOrDefault(club)) }
}

// The club's colors, written by the server before anything paints (no flash). globals.css keeps Rustic's as a
// fallback and maps the tokens to Tailwind; this style replaces their values.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const club = await findClub()
  const brand = brandOrDefault(club)
  return (
    <html lang="es" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <head>
        <style id="club-theme" dangerouslySetInnerHTML={{ __html: themeCss(clubTheme(brand), brand.mode) }} />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <ActivityProvider>{children}</ActivityProvider>
      </body>
    </html>
  )
}
