import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonStyle = { variant?: ButtonVariant; fullWidth?: boolean; className?: string }
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 font-display text-lg font-bold uppercase tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50'

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
export function buttonClasses({ variant = 'primary', fullWidth = false, className }: ButtonStyle = {}): string {
  return cn(BASE, VARIANTS[variant], fullWidth && 'button-block w-full', className)
}

export function Button({ variant, fullWidth, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, fullWidth, className })} {...props} />
}
