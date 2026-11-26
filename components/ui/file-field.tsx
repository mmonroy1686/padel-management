'use client'

import { useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'

type FileFieldProps = {
  id: string
  name: string
  label: string
  accept: string
  inputRef: RefObject<HTMLInputElement | null>
  ariaRequired?: boolean
  multiple?: boolean
  // The button's text ("Elegir archivo" by default).
  buttonLabel?: string
  // Called once the person picked: a form that uploads on pick (the logo) submits from here.
  onPick?: () => void
}

// A file picker in Spanish: the browser's own one reads "Choose File / No file chosen" in English on
// many phones. The native input stays (forms and tests read it); the button opens it.
export function FileField({ id, name, label, accept, inputRef, ariaRequired, multiple, buttonLabel = 'Elegir archivo', onPick }: FileFieldProps) {
  const [fileName, setFileName] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          {buttonLabel}
        </Button>
        <span className="min-w-0 truncate text-sm text-fg-muted" aria-live="polite">
          {fileName ?? 'Ningún archivo elegido'}
        </span>
      </div>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        aria-required={ariaRequired}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const files = event.target.files
          setFileName(files && files.length > 1 ? `${files.length} archivos` : (files?.[0]?.name ?? null))
          if (files && files.length > 0) onPick?.()
        }}
      />
    </div>
  )
}
