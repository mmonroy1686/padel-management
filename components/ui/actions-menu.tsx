'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { buttonClasses } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean }

// The row's actions behind one "Acciones" button, instead of several loose ones. A menu button: Enter, Space or
// the arrows open it, the arrows move, Escape or a click outside close it and give the focus back. A danger item
// goes last, after a line, in the danger color.
export function ActionsMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const ordered = [...items.filter((item) => !item.danger), ...items.filter((item) => item.danger)]

  const focusItem = (index: number) => {
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    if (!buttons || buttons.length === 0) return
    buttons[(index + buttons.length) % buttons.length].focus()
  }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  return (
    <div ref={root} className="relative inline-block">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className={buttonClasses({ variant: 'secondary', size: 'sm' })}
      >
        Acciones
        <Icon name="chevron-down" className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              focusItem(index + 1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              focusItem(index - 1)
            } else if (event.key === 'Escape' || event.key === 'Tab') {
              if (event.key === 'Escape') event.preventDefault()
              close(event.key === 'Escape')
            }
          }}
          className="menu-pop absolute right-0 z-20 mt-1 flex min-w-48 flex-col rounded-xl border border-border bg-bg p-1 shadow-lg"
        >
          {ordered.map((item, index) => (
            <li key={item.label} role="none" className={cn(item.danger && index > 0 && 'mt-1 border-t border-border pt-1')}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close()
                  item.onSelect()
                }}
                className={cn(
                  'flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold hover:bg-surface focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-accent',
                  item.danger ? 'text-danger' : 'text-fg',
                )}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
