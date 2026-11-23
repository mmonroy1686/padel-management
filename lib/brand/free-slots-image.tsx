import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { hasFreeSlots, type FlyerLayout } from '@/lib/domain/free-slots-flyer'
import { Mark } from './brand-images'
import type { LoadedBrand } from './load-brand'

export const FLYER_SIZE = { width: 1080, height: 1920 }
// Staff only and drawn from the day's grid: never kept by a CDN.
const HEADERS = { 'cache-control': 'private, no-store' }

// The flyer's title and times in Barlow Condensed, the panel's display font (OFL, assets/fonts). next.config.ts
// traces the file into the flyer route.
export const FLYER_FONT = 'Barlow Condensed'
export function loadFlyerFont(): Promise<Buffer> {
  return readFile(join(process.cwd(), 'assets/fonts/BarlowCondensed-ExtraBold.ttf'))
}

// The cross over a taken time: two lines from side to side. ImageResponse has no glyph we can trust for it.
function Cross({ color }: { color: string }) {
  const line = { position: 'absolute' as const, left: '8%', top: '50%', width: '84%', height: 4, background: color }
  return (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div style={{ ...line, transform: 'rotate(18deg)' }} />
      <div style={{ ...line, transform: 'rotate(-18deg)' }} />
    </div>
  )
}

// The free slots of a day as clubs post them: the title, the day, the courts in columns with the times in pills of
// the club's color (the taken ones crossed out), and the mark with the WhatsApp at the bottom. ImageResponse only
// knows flexbox and inline styles.
export function freeSlotsImage(
  brand: LoadedBrand,
  layout: FlyerLayout,
  text: { day: string; contact: string },
  font?: ArrayBuffer | Buffer,
): ImageResponse {
  const { colors } = brand
  const display = font ? { fontFamily: FLYER_FONT, fontWeight: 800 as const } : { fontWeight: 700 as const }
  const pillHeight = layout.compact ? 64 : 88
  const pillFont = layout.compact ? 34 : 46
  const columnWidth = layout.narrow ? 150 : 230
  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: 72, gap: 56, background: colors.bg, color: colors.fg }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 190, lineHeight: 0.95, color: colors.accent, ...display }}>
            <span>TURNOS</span>
            <span>LIBRES</span>
          </div>
          <div style={{ display: 'flex', fontSize: 64, letterSpacing: 2, ...display }}>{text.day}</div>
        </div>
        {hasFreeSlots(layout) ? (
          <div style={{ display: 'flex', flex: 1, justifyContent: 'center', gap: layout.narrow ? 16 : 28 }}>
            {layout.columns.map((column, index) => (
              <div key={column.courtId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: columnWidth }}>
                <div style={{ display: 'flex', fontSize: layout.narrow ? 34 : 44, textAlign: 'center', ...display }}>{column.name}</div>
                {layout.rows.map((row) => {
                  const cell = row.cells[index]
                  if (cell === 'none') return <div key={row.label} style={{ display: 'flex', height: pillHeight }} />
                  const free = cell === 'free'
                  return (
                    <div
                      key={row.label}
                      style={{
                        display: 'flex',
                        position: 'relative',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: pillHeight,
                        borderRadius: pillHeight / 2,
                        fontSize: pillFont,
                        ...display,
                        background: free ? colors.accent : 'transparent',
                        color: free ? colors['on-accent'] : colors['fg-muted'],
                        border: `3px solid ${free ? colors.accent : colors['fg-muted']}`,
                      }}
                    >
                      {row.label}
                      {free ? null : <Cross color={colors['fg-muted']} />}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', fontSize: 56, textAlign: 'center' }}>
            No quedan turnos libres este día.
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
          <Mark brand={brand} size={140} />
          <div style={{ display: 'flex', fontSize: 52, ...display }}>{text.contact}</div>
        </div>
      </div>
    ),
    {
      ...FLYER_SIZE,
      headers: HEADERS,
      fonts: font ? [{ name: FLYER_FONT, data: font, weight: 800, style: 'normal' }] : undefined,
    },
  )
}
