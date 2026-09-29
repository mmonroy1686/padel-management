'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Card } from '@/components/ui/card'
import { Field, inputClasses } from '@/components/ui/field'
import { filterMembers, type MemberView } from '@/lib/domain/members'
import { CATEGORIES, categoryLabel, ROLE_LABELS, ROLES } from '@/lib/domain/profile'

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
  const [query, setQuery] = useState('')
  const shown = filterMembers(members, query)

  return (
    <div className="flex flex-col gap-4">
      <Field label="Buscar jugador" htmlFor="buscar">
        <input id="buscar" type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={inputClasses} />
      </Field>
      {shown.length === 0 ? <p className="text-fg-muted">No encontramos a nadie con ese nombre.</p> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {shown.map((member) => (
          <li key={member.userId}>
            <Card className="flex flex-col gap-3">
              <div>
                <p className="font-semibold">{member.name}</p>
                <p className="text-sm text-fg-muted">
                  {ROLE_LABELS[member.role]}. {categoryLabel(member.category, member.validated)}.
                </p>
              </div>
              <ActionForm
                action={validateAction}
                submitLabel={member.validated ? 'Corregir categoría' : 'Validar categoría'}
                variant="secondary"
              >
                <input type="hidden" name="userId" value={member.userId} />
                <Field label={`Categoría de ${member.name}`} htmlFor={`category-${member.userId}`}>
                  <select
                    id={`category-${member.userId}`}
                    name="category"
                    defaultValue={member.category ?? 5}
                    className={inputClasses}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}ª
                      </option>
                    ))}
                  </select>
                </Field>
              </ActionForm>
              {canChangeRoles && member.userId !== viewerId ? (
                <ActionForm action={roleAction} submitLabel="Cambiar rol" variant="ghost">
                  <input type="hidden" name="userId" value={member.userId} />
                  <Field label={`Rol de ${member.name}`} htmlFor={`role-${member.userId}`}>
                    <select id={`role-${member.userId}`} name="role" defaultValue={member.role} className={inputClasses}>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </ActionForm>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
