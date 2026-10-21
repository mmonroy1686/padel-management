'use client'

import { useId, useMemo, useState } from 'react'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { searchMembers, type MemberOption } from '@/lib/domain/members'

const MAX_SHOWN = 6

// One player of a booking: a member picked from the list, or whatever name reception types (someone without an
// account). Empty means nobody yet. The form gets player{n}Id or player{n}Name, never both.
export function PlayerNameField({
  id,
  position,
  members,
  initial,
}: {
  id: string
  position: number
  members: MemberOption[]
  initial: { playerId: string | null; name: string | null }
}) {
  const listId = useId()
  const [query, setQuery] = useState(initial.name ?? '')
  const [picked, setPicked] = useState<MemberOption | null>(
    initial.playerId ? { userId: initial.playerId, name: initial.name ?? '' } : null,
  )
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = useMemo(() => searchMembers(members, query, MAX_SHOWN), [members, query])
  const showList = open && query.trim() !== '' && !picked && matches.length > 0

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
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        maxLength={60}
        placeholder="Buscá un socio o escribí un nombre"
        value={query}
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
          } else if (event.key === 'Enter' && showList && matches[active]) {
            event.preventDefault()
            pick(matches[active])
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
        className={inputClasses}
      />
      <input type="hidden" name={`player${position}Id`} value={picked?.userId ?? ''} />
      <input type="hidden" name={`player${position}Name`} value={picked ? '' : query.trim()} />
      {showList ? (
        <ul id={listId} role="listbox" className="mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-bg p-1">
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
      ) : null}
      <p className="mt-1 text-xs text-fg-muted">
        {picked ? 'Socio del club.' : query.trim() !== '' ? 'Sin cuenta: queda solo el nombre.' : 'Sin nombre por ahora.'}
      </p>
    </div>
  )
}
