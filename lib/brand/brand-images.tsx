import { ImageResponse } from 'next/og'
import { clubInitials } from '@/lib/domain/club-brand'
import type { SharePreview } from '@/lib/domain/share-preview'
import type { LoadedBrand } from './load-brand'

const PREVIEW_SIZE = { width: 1200, height: 630 }

// The logo on the club's background, or the initials on its primary color. ImageResponse only knows flexbox and
// inline styles.
function Mark({ brand, size }: { brand: LoadedBrand; size: number }) {
  const { colors, logo, name } = brand
  if (logo) {
    return (
      <div style={{ display: 'flex', width: size, height: size, alignItems: 'center', justifyContent: 'center', background: colors.bg, borderRadius: size * 0.2 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain img only */}
        <img src={logo} alt={name} width={size * 0.8} height={size * 0.8} style={{ objectFit: 'contain' }} />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', width: size, height: size, alignItems: 'center', justifyContent: 'center', background: colors.accent, color: colors['on-accent'], borderRadius: size / 2, fontSize: size * 0.42, fontWeight: 700 }}>
      {clubInitials(name)}
    </div>
  )
}

// app/icon.tsx and app/apple-icon.tsx: the mark filling the square, on the club's background.
export function iconImage(brand: LoadedBrand, size: number): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: brand.colors.bg }}>
        <Mark brand={brand} size={size} />
      </div>
    ),
    { width: size, height: size },
  )
}

// The opengraph-image of every page: the mark, the title and a line under it, on the club's background.
export function previewImage(brand: LoadedBrand, preview: SharePreview): ImageResponse {
  const { colors } = brand
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', gap: 64, padding: 80, background: colors.bg, borderBottom: `24px solid ${colors.accent}` }}>
        <Mark brand={brand} size={240} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1, color: colors.fg }}>{preview.title}</div>
          <div style={{ fontSize: 36, color: colors['fg-muted'] }}>{preview.description}</div>
        </div>
      </div>
    ),
    PREVIEW_SIZE,
  )
}
