import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
// md: the screen's actions, in the display font. sm: actions inside a row or a card, in body text; still 44px tall.
export type ButtonSize = 'md' | 'sm'
type ButtonStyle = { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string }
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle & { ref?: Ref<HTMLButtonElement> }

const BASE =
  'inline-flex min-h-11 items-center justify-center rounded-xl transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50'

const SIZES: Record<ButtonSize, string> = {
  md: 'gap-2 px-5 font-display text-lg font-bold uppercase tracking-wide',
  sm: 'gap-1.5 px-3 text-sm font-semibold whitespace-nowrap',
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-95',
  // The club's primary as its border and a tint behind the text: clearly the club's, a step under primary. The text
  // is fg, not accent-ink: accent-ink sits near 4.5:1 and a tint would push it under; fg stays above 5.8:1 on a
  // 20% tint for every palette.
  secondary: 'border-2 border-accent bg-accent/12 text-fg hover:bg-accent/20',
  ghost: 'text-accent-ink hover:bg-surface',
  danger: 'border border-danger text-danger hover:bg-surface',
}

// Also used by links that look like buttons (<Link className={buttonClasses()}>). fullWidth fills a
// phone's width; on wider screens it stops at a comfortable size (.button-block in globals.css).
export function buttonClasses({ variant = 'primary', size = 'md', fullWidth = false, className }: ButtonStyle = {}): string {
  return cn(BASE, SIZES[size], VARIANTS[variant], fullWidth && 'button-block w-full', className)
}

export function Button({ variant, size, fullWidth, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, fullWidth, className })} {...props} />
}

// A chosen option in a set (day chips, filters, toggles, tabs): ink inverted, not the club's color. Solid amber is
// kept for the one action of a screen, so a selected filter never competes with it.
export const SELECTED = 'border-fg bg-fg text-bg'
