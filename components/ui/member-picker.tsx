'use client'

import { useId, useMemo, useState } from 'react'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { normalizeText, type MemberOption } from '@/lib/domain/members'

const MAX_SHOWN = 8

// A member search for reception: type part of the name (accents and case do not matter) and pick
// from the list with a tap or the keyboard. The list sits in the flow, not floating, so a sheet
// that scrolls never cuts it. The form gets the member's id in a hidden input; the
// text box stays invalid until someone from the list is picked.
export function MemberPicker({ id, name, members }: { id: string; name: string; members: MemberOption[] }) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<MemberOption | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const matches = useMemo(() => {
    const words = normalizeText(query).split(/\s+/).filter(Boolean)
    const found = members.filter((member) => {
      const text = normalizeText(member.name)
      return words.every((word) => text.includes(word))
    })
    return found.slice(0, MAX_SHOWN)
  }, [members, query])

  const pick = (member: MemberOption) => {
    setPicked(member)
    setQuery(member.name)
    setOpen(false)
  }

  return (
    <div>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Escribí el nombre"
        value={query}
        // The browser's own check: the box is invalid until a member is picked.
        ref={(input) => input?.setCustomValidity(picked ? '' : 'Elegí un jugador de la lista.')}
        onChange={(event) => {
          setQuery(event.target.value)
          setPicked(null)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setActive((index) => Math.min(index + 1, matches.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter' && open && matches[active]) {
            event.preventDefault()
            pick(matches[active])
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
        className={inputClasses}
      />
      <input type="hidden" name={name} value={picked?.userId ?? ''} />
      {open && query.trim() !== '' && !picked ? (
        matches.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            className="mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-bg p-1"
          >
            {matches.map((member, index) => (
              <li
                key={member.userId}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // mousedown, not click: it runs before the text box loses focus and closes the list.
                onMouseDown={(event) => {
                  event.preventDefault()
                  pick(member)
                }}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center rounded-lg px-3',
                  index === active ? 'bg-accent text-on-accent' : 'hover:bg-surface',
                )}
              >
                {member.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 rounded-xl border border-border bg-bg p-3 text-sm text-fg-muted">
            Nadie con ese nombre.
          </p>
        )
      ) : null}
    </div>
  )
}
