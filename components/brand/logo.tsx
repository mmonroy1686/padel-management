import { clubInitials } from '@/lib/domain/club-brand'

// Placeholder until the club uploads its logo: its initials on its primary color (the tokens follow the club).
export function Logo({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={name} className={className}>
      <circle cx="32" cy="32" r="30" fill="var(--accent)" />
      <text
        x="32"
        y="41"
        textAnchor="middle"
        fontFamily="var(--font-barlow-condensed), sans-serif"
        fontWeight="700"
        fontSize="26"
        fill="var(--on-accent)"
      >
        {clubInitials(name)}
      </text>
    </svg>
  )
}
