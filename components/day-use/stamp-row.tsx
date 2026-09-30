import { cn } from '@/lib/cn'
import { rewardLabel, stampsText, type Loyalty, type LoyaltyRule } from '@/lib/domain/loyalty'

// A padel ball: an earned stamp in amber with its seam; a missing one dotted, with its number.
function Ball({ number, earned, fresh }: { number: number; earned: boolean; fresh: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      className={cn('size-10', earned ? 'text-accent' : 'text-fg-muted', fresh && 'stamp-pop')}
    >
      {earned ? (
        <>
          <circle cx="20" cy="20" r="17" fill="currentColor" />
          <path d="M9 8c6 5 6 19 0 24M31 8c-6 5-6 19 0 24" fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 4" />
          <text x="20" y="25" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor">
            {number}
          </text>
        </>
      )}
    </svg>
  )
}

// The gift at the end of the row, with the discount the club gives.
function Gift({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-10 items-center gap-1 rounded-full border-2 px-2 text-sm font-bold',
        ready ? 'border-accent bg-accent text-on-accent' : 'border-dashed border-fg-muted text-fg-muted',
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="8" width="18" height="4" rx="1" />
        <path d="M12 8v13M5 12v9h14v-9M12 8C10 4 7 4 7 6s3 2 5 2c2 0 5 0 5-2s-3-2-5 2" />
      </svg>
      {label}
    </span>
  )
}

// Design: "Sellos". The progress towards the next reward; the stamp just earned pops once
// (.stamp-pop in globals.css, skipped with reduced motion).
export function StampRow({ loyalty, rule }: { loyalty: Loyalty; rule: LoyaltyRule }) {
  const ready = loyalty.available > 0
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label="Tus sellos" className="flex flex-wrap items-center gap-2">
        {Array.from({ length: rule.every }, (_, index) => {
          const earned = index < loyalty.progress
          return (
            <li key={index} aria-label={`Sello ${index + 1}: ${earned ? 'ganado' : 'falta'}`}>
              <Ball number={index + 1} earned={earned} fresh={earned && index === loyalty.progress - 1} />
            </li>
          )
        })}
        <li aria-label={`Recompensa ${rewardLabel(rule.discountPercent)}: ${ready ? 'disponible' : 'por ganar'}`}>
          <Gift label={rewardLabel(rule.discountPercent)} ready={ready} />
        </li>
      </ol>
      <p className="text-sm">
        {stampsText(loyalty, rule)}
        {ready ? ` · Tenés ${loyalty.available === 1 ? '1 recompensa' : `${loyalty.available} recompensas`}` : ''}
      </p>
    </div>
  )
}
