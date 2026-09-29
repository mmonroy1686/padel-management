const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function linearize(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const match = HEX_COLOR.exec(hex)
  if (!match) throw new Error(`Not a hex color: ${hex}`)

  const digits = match[1].length === 3
    ? match[1].split('').map((digit) => digit + digit).join('')
    : match[1]
  const [r, g, b] = [0, 2, 4].map((start) => parseInt(digits.slice(start, start + 2), 16))

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}
