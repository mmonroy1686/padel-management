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
}

// A file picker in Spanish: the browser's own one reads "Choose File / No file chosen" in English on
// many phones. The native input stays (forms and tests read it); the button opens it.
export function FileField({ id, name, label, accept, inputRef, ariaRequired }: FileFieldProps) {
  const [fileName, setFileName] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          Elegir archivo
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
        aria-required={ariaRequired}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
      />
    </div>
  )
}
