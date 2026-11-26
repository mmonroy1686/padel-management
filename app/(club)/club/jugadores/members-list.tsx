'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Avatar } from '@/components/ui/avatar'
import { BrandIcon } from '@/components/ui/brand-icon'
import { buttonClasses } from '@/components/ui/button'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import { Field, inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { playerWhatsappUrl } from '@/lib/domain/contact'
import { formatPhone } from '@/lib/domain/format'
import type { MemberView } from '@/lib/domain/members'
import { CATEGORIES, ROLE_LABELS, ROLES } from '@/lib/domain/profile'

const COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Nombre', sortable: true },
  { key: 'role', label: 'Rol', sortable: true },
  { key: 'category', label: 'Categoría', sortable: true },
  { key: 'actions', label: 'Acciones', hideLabel: true },
]

// Club panel: every member in a table (search, filters, pages); "Editar" opens the category and,
// for admins, the role.
export function MembersList({
  members,
  viewerId,
  canChangeRoles,
  validateAction,
  roleAction,
  timezone,
}: {
  members: MemberView[]
  viewerId: string
  canChangeRoles: boolean
  validateAction: FormAction
  roleAction: FormAction
  // The club's, to open a WhatsApp chat with the international number.
  timezone: string
}) {
  const [editing, setEditing] = useState<MemberView | null>(null)

  const rows: DataRow[] = members.map((member) => ({
    id: member.userId,
    search: member.name,
    sort: { name: member.name, role: ROLE_LABELS[member.role], category: member.category ?? 99 },
    filters: {
      role: member.role,
      category: member.category === null ? '' : String(member.category),
      validation: member.validated ? 'validated' : 'pending',
    },
    cells: {
      name: (
        <span className="inline-flex items-center gap-3">
          <Avatar name={member.name} profile={member.avatar} size="sm" />
          <span className="font-semibold">{member.name}</span>
        </span>
      ),
      role: ROLE_LABELS[member.role],
      category: (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="tabular-nums">{member.category === null ? 'Sin categoría' : `${member.category}ª`}</span>
          {member.category === null ? null : (
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs font-semibold',
                member.validated ? 'border-court-ink text-court-ink' : 'border-accent text-accent-ink',
              )}
            >
              {member.validated ? 'Validada' : 'Sin validar'}
            </span>
          )}
        </span>
      ),
      actions: (
        <button
          type="button"
          aria-label={`Editar a ${member.name}`}
          onClick={() => setEditing(member)}
          className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          Editar
        </button>
      ),
    },
  }))

  return (
    <>
      <DataTable
        caption="Jugadores del club"
        columns={COLUMNS}
        rows={rows}
        searchLabel="Buscar jugador"
        searchPlaceholder="Nombre o apellido"
        initialSort={{ key: 'name', dir: 'asc' }}
        filters={[
          { key: 'role', label: 'Rol', options: ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })) },
          { key: 'category', label: 'Categoría', options: CATEGORIES.map((category) => ({ value: String(category), label: `${category}ª` })) },
          {
            key: 'validation',
            label: 'Validación',
            options: [
              { value: 'pending', label: 'Sin validar' },
              { value: 'validated', label: 'Validada' },
            ],
          },
        ]}
        emptyText="Todavía no hay jugadores en el club."
        phone="rows"
      />
      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.name ?? ''}>
        {editing ? (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-fg-muted">{ROLE_LABELS[editing.role]}</p>
            <MemberContact member={editing} timezone={timezone} />
            <ActionForm
              key={`category-${editing.userId}`}
              action={validateAction}
              submitLabel={editing.validated ? 'Corregir categoría' : 'Validar categoría'}
              variant="secondary"
            >
              <input type="hidden" name="userId" value={editing.userId} />
              <Field label="Categoría" htmlFor="member-category">
                <select id="member-category" name="category" defaultValue={editing.category ?? 5} className={inputClasses}>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}ª
                    </option>
                  ))}
                </select>
              </Field>
            </ActionForm>
            {canChangeRoles && editing.userId !== viewerId ? (
              <ActionForm key={`role-${editing.userId}`} action={roleAction} submitLabel="Cambiar rol" variant="ghost">
                <input type="hidden" name="userId" value={editing.userId} />
                <Field label="Rol" htmlFor="member-role">
                  <select id="member-role" name="role" defaultValue={editing.role} className={inputClasses}>
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </Field>
              </ActionForm>
            ) : null}
          </div>
        ) : null}
      </BottomSheet>
    </>
  )
}

// How to reach the member: the email they sign in with and their WhatsApp. The chat opens only if they accepted it.
function MemberContact({ member, timezone }: { member: MemberView; timezone: string }) {
  const chat = playerWhatsappUrl(member.contact, timezone, `Hola ${member.name.split(' ')[0]}`)
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {member.email ? (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-fg-muted">Email</dt>
          <dd className="font-semibold break-all">{member.email}</dd>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <dt className="text-fg-muted">WhatsApp</dt>
        <dd className="flex flex-wrap items-center gap-2">
          {member.contact?.phone ? <span className="font-semibold tabular-nums">{formatPhone(member.contact.phone)}</span> : <span>No lo cargó</span>}
          {chat ? (
            <a href={chat} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${member.name}`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
              <BrandIcon name="whatsapp" className="size-4" />
              WhatsApp
            </a>
          ) : member.contact?.phone ? (
            <span className="text-fg-muted">No aceptó mensajes por WhatsApp</span>
          ) : null}
        </dd>
      </div>
    </dl>
  )
}
