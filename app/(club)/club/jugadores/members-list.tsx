'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { DataTable, type DataColumn, type DataRow } from '@/components/ui/data-table'
import { Field, inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/cn'
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
}: {
  members: MemberView[]
  viewerId: string
  canChangeRoles: boolean
  validateAction: FormAction
  roleAction: FormAction
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
      name: <span className="font-semibold">{member.name}</span>,
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
      />
      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.name ?? ''}>
        {editing ? (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-fg-muted">{ROLE_LABELS[editing.role]}</p>
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
