'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

// The club's photos side by side with native scroll; the cover is the big one. Tapping one opens it in a dialog.
export function PhotoStrip({ photos, clubName }: { photos: string[]; clubName: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  const alt = (index: number) => `Foto ${index + 1} de ${clubName}`

  function show(index: number) {
    setOpen(index)
    dialog.current?.showModal?.()
  }

  return (
    <>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0" aria-label={`Fotos de ${clubName}`}>
        {photos.map((url, index) => (
          <li key={url} className={index === 0 ? 'w-[85%] shrink-0 snap-start md:w-2/3' : 'w-[60%] shrink-0 snap-start md:w-1/3'}>
            <button type="button" onClick={() => show(index)} aria-label={`Ver en grande la foto ${index + 1}`}
              className="block w-full overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-accent">
              {/* eslint-disable-next-line @next/next/no-img-element -- a public Storage file, sized by the browser */}
              <img src={url} alt={alt(index)} loading={index === 0 ? 'eager' : 'lazy'} className="aspect-[4/3] w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <dialog ref={dialog} onClose={() => setOpen(null)} aria-label={open === null ? 'Foto' : alt(open)}
        className="m-auto max-h-[90dvh] w-[min(64rem,95vw)] rounded-2xl bg-surface p-3 backdrop:bg-black/80">
        {open !== null ? (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- the same public file, bigger */}
            <img src={photos[open]} alt={alt(open)} className="max-h-[75dvh] w-full rounded-xl object-contain" />
            <Button variant="secondary" onClick={() => dialog.current?.close()} fullWidth>
              Cerrar
            </Button>
          </div>
        ) : null}
      </dialog>
    </>
  )
}
