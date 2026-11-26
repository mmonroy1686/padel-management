'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ClubLogo } from '@/components/brand/club-logo'
import { MatchCourt } from '@/components/matches/match-court'
import type { FormAction } from '@/components/ui/action-form'
import { AutoSaveForm } from '@/components/ui/auto-save-form'
import { Button } from '@/components/ui/button'
import { Field, inputClasses } from '@/components/ui/field'
import { adjustmentNotice, COLOR_MODE_LABELS, COLOR_MODES, DEFAULT_BRAND, normalizeHex } from '@/lib/domain/club-brand'
import { clubTheme, THEME_TOKENS, type ColorMode, type ThemeMode, type Tokens } from '@/lib/domain/club-theme'
import type { MatchSlot } from '@/lib/domain/matches'

export type BrandFormProps = {
  club: { name: string; logo_path: string | null; brand_primary: string; brand_background: string; color_mode: ColorMode }
  action: FormAction
}

// Two players and two missing spots: how a taken spot and a missing one look, side by side.
const SAMPLE_SLOTS: MatchSlot[] = [
  { position: 1, side: 'drive', playerId: 'ana', playerName: 'Ana' },
  { position: 2, side: 'backhand', playerId: null, playerName: null },
  { position: 3, side: 'drive', playerId: 'bruno', playerName: 'Bruno' },
  { position: 4, side: 'backhand', playerId: null, playerName: null },
]

function tokenStyle(tokens: Tokens, mode: ThemeMode): CSSProperties {
  return { colorScheme: mode, ...Object.fromEntries(THEME_TOKENS.map((token) => [`--${token}`, tokens[token]])) }
}

// Ajustes → "Marca del club": the two colors (picker and #RRGGBB), the mode and a live preview in both modes.
export function BrandForm({ club, action }: BrandFormProps) {
  const [primaryText, setPrimaryText] = useState(club.brand_primary)
  const [backgroundText, setBackgroundText] = useState(club.brand_background)
  const [mode, setMode] = useState<ColorMode>(club.color_mode)
  // One preview at a time (the two side by side took most of the page): the mode it shows in, switchable.
  const [previewMode, setPreviewMode] = useState<ThemeMode>(club.color_mode === 'light' ? 'light' : 'dark')
  const primary = normalizeHex(primaryText)
  const background = normalizeHex(backgroundText)
  // An unfinished #RRGGBB previews as the saved color until it is complete.
  const theme = clubTheme({ primary: primary ?? club.brand_primary, background: background ?? club.brand_background })
  const notice = adjustmentNotice(theme.adjusted, mode)

  // The brand saves itself like the rest of Ajustes (no "Guardar marca"); going back to the original colors saves
  // them too, once the fields show them.
  const resetButton = useRef<HTMLButtonElement>(null)
  const [resets, setResets] = useState(0)
  useEffect(() => {
    if (resets > 0) resetButton.current?.form?.requestSubmit()
  }, [resets])
  const reset = () => {
    setPrimaryText(DEFAULT_BRAND.primary)
    setBackgroundText(DEFAULT_BRAND.background)
    setMode(DEFAULT_BRAND.mode)
    setResets((count) => count + 1)
  }

  const colorField = (
    id: string,
    name: string,
    label: string,
    text: string,
    setText: (value: string) => void,
    value: string | null,
  ) => (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={`Elegir el ${label.toLowerCase()}`}
          value={(value ?? '#000000').toLowerCase()}
          onChange={(event) => setText(event.target.value.toUpperCase())}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-border bg-bg p-1"
        />
        <input
          id={id}
          name={name}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={7}
          required
          // A half-typed color is not saved: the field says so and the saved one stays.
          pattern="#?[0-9A-Fa-f]{6}"
          title="Un color como #FCB021"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={value === null || undefined}
          className={`${inputClasses} font-mono uppercase`}
        />
      </div>
    </Field>
  )

  return (
    <AutoSaveForm action={action} label="la marca del club" className="gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        {colorField('brand-primary', 'primary', 'Color principal', primaryText, setPrimaryText, primary)}
        {colorField('brand-background', 'background', 'Color de fondo', backgroundText, setBackgroundText, background)}
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-semibold">Modo</legend>
        {COLOR_MODES.map((value) => (
          <label key={value} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="size-5 accent-accent"
            />
            {COLOR_MODE_LABELS[value]}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-3">
        {/* Only what the preview shows, not a fourth mode: labelled so. */}
        <div className="flex items-center gap-3">
        <span id="vista-previa" className="text-sm font-semibold">Vista previa</span>
        <div role="group" aria-labelledby="vista-previa" className="inline-flex self-start rounded-full border border-border bg-surface p-1">
          {(['dark', 'light'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={previewMode === value}
              onClick={() => setPreviewMode(value)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${previewMode === value ? 'bg-bg text-fg shadow-sm' : 'text-fg-muted'}`}
            >
              {value === 'dark' ? 'Oscuro' : 'Claro'}
            </button>
          ))}
        </div>
        </div>
        <div className="max-w-md">
          {previewMode === 'dark' ? (
            <Preview label="Oscuro" mode="dark" tokens={theme.dark} club={club} />
          ) : (
            <Preview label="Claro" mode="light" tokens={theme.light} club={club} />
          )}
        </div>
      </div>
      {notice ? (
        <p role="note" className="text-sm text-fg-muted">
          {notice}
        </p>
      ) : null}
      <Button ref={resetButton} type="button" variant="ghost" onClick={reset}>
        Volver a los colores originales
      </Button>
    </AutoSaveForm>
  )
}

function Preview({
  label,
  mode,
  tokens,
  club,
}: {
  label: string
  mode: ThemeMode
  tokens: Tokens
  club: BrandFormProps['club']
}) {
  return (
    <section
      aria-label={`Vista previa en modo ${label.toLowerCase()}`}
      style={tokenStyle(tokens, mode)}
      className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-bg p-3 text-fg"
    >
      <div className="flex items-center gap-2 border-b border-border pb-2 font-display text-lg font-bold uppercase">
        <ClubLogo club={club} className="size-7" />
        {club.name}
      </div>
      <span className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 font-display text-lg font-bold uppercase text-on-accent">
        Reservar
      </span>
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <b>Cancha 1 · 20:00</b>
          <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold uppercase text-on-accent">En juego</span>
        </div>
        <p className="text-sm text-fg-muted">Texto suave, como las aclaraciones.</p>
        <p className="text-sm font-semibold text-accent-ink">Ver el partido</p>
      </div>
      <MatchCourt match={{ slots: SAMPLE_SLOTS }} viewerId="preview" />
    </section>
  )
}
