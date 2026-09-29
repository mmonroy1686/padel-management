// Placeholder until the club sends its SVG. Replace the <svg> contents, keep the props.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Rustic Pádel" className={className}>
      <circle cx="32" cy="32" r="30" fill="#FCB021" />
      <text
        x="32"
        y="41"
        textAnchor="middle"
        fontFamily="var(--font-barlow-condensed), sans-serif"
        fontWeight="700"
        fontSize="26"
        fill="#000000"
      >
        RP
      </text>
    </svg>
  )
}
