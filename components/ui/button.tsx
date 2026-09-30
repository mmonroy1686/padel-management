import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonStyle = { variant?: ButtonVariant; fullWidth?: boolean; className?: string }
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 font-display text-lg font-bold uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-95',
  secondary: 'border border-border bg-surface text-fg hover:border-accent',
  ghost: 'text-accent-ink hover:bg-surface',
  danger: 'border border-danger text-danger hover:bg-surface',
}

// Also used by links that look like buttons (<Link className={buttonClasses()}>).
export function buttonClasses({ variant = 'primary', fullWidth = false, className }: ButtonStyle = {}): string {
  return cn(BASE, VARIANTS[variant], fullWidth && 'w-full', className)
}

export function Button({ variant, fullWidth, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, fullWidth, className })} {...props} />
}
