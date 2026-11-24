'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import { suggestSlug, TIMEZONES } from '@/lib/domain/platform'

// /plataforma → "Nuevo club". The short name follows the name until it is edited by hand.
// `domain`: what follows the slug in the club's address (".localhost:3000", ".tudominio.uy").
export function NewClubForm({ action, domain }: { action: FormAction; domain: string }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  return (
    <ActionForm action={action} submitLabel="Crear club" pendingLabel="Creando…">
      <Field label="Nombre del club" htmlFor="club-name">
        <input
          id="club-name"
          name="name"
          required
          maxLength={60}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (!slugEdited) setSlug(suggestSlug(event.target.value))
          }}
          className={inputClasses}
        />
      </Field>
      <Field
        label="Nombre corto"
        htmlFor="club-slug"
        hint={`El club queda en ${slug || 'nombre-corto'}${domain}`}
      >
        <input
          id="club-slug"
          name="slug"
          required
          maxLength={40}
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value.toLowerCase())
            setSlugEdited(true)
          }}
          autoCapitalize="none"
          autoComplete="off"
          aria-describedby="club-slug-hint"
          className={inputClasses}
        />
      </Field>
      <Field label="Zona horaria" htmlFor="club-timezone">
        <select id="club-timezone" name="timezone" defaultValue={TIMEZONES[0].id} className={inputClasses}>
          {TIMEZONES.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Email del admin" htmlFor="club-admin" hint="Le llega la invitación para entrar y configurar el club.">
        <input id="club-admin" name="adminEmail" type="email" required autoComplete="off"
          aria-describedby="club-admin-hint" className={inputClasses} />
      </Field>
    </ActionForm>
  )
}
