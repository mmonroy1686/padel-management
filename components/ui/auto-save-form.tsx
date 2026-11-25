'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import type { FormAction } from '@/components/ui/action-form'
import { Icon, Spinner } from '@/components/ui/icon'
import { IDLE } from '@/lib/actions/result'
import { cn } from '@/lib/cn'

// How long typing has to stop before a text field saves on its own.
const TYPING_MS = 800
// How long "Guardado" stays.
const SAVED_MS = 2000

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }

// A form that saves itself (design ux-v2, Miguel's call on 25/11): boxes and selects as soon as they change, text
// fields when you leave them or stop typing. Each save sends the whole form to the same Server Action as before,
// so the rules do not change. What does not pass the browser's own checks (required, maxLength) is not sent: the
// field says what is wrong and the saved value stays. The status sits next to the group: «Guardando…»,
// «Guardado» for a moment, or the error with «Reintentar».
export function AutoSaveForm({
  action,
  label,
  className,
  children,
}: {
  action: FormAction
  // What this form saves, for the status line's screen reader text ("Horarios guardados").
  label: string
  className?: string
  children: ReactNode
}) {
  const form = useRef<HTMLFormElement>(null)
  const typing = useRef<number | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (status.kind !== 'saved') return
    const timer = window.setTimeout(() => setStatus({ kind: 'idle' }), SAVED_MS)
    return () => window.clearTimeout(timer)
  }, [status])
  useEffect(
    () => () => {
      if (typing.current) window.clearTimeout(typing.current)
    },
    [],
  )

  const save = () => {
    const element = form.current
    if (!element) return
    if (typing.current) window.clearTimeout(typing.current)
    if (!element.checkValidity()) {
      element.reportValidity()
      return
    }
    const data = new FormData(element)
    setStatus({ kind: 'saving' })
    startTransition(async () => {
      const result = await action(IDLE, data)
      setStatus(result?.status === 'error' ? { kind: 'error', message: result.message ?? 'No pudimos guardar.' } : { kind: 'saved' })
    })
  }
  const saveSoon = () => {
    if (typing.current) window.clearTimeout(typing.current)
    typing.current = window.setTimeout(save, TYPING_MS)
  }
  const isText = (target: EventTarget) =>
    target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && !['checkbox', 'radio'].includes(target.type))

  return (
    <form
      ref={form}
      className={cn('flex flex-col gap-3', className)}
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
      onChange={(event) => (isText(event.target) ? saveSoon() : save())}
      onBlur={(event) => {
        if (isText(event.target) && typing.current) save()
      }}
    >
      {children}
      <div className="min-h-6 text-sm" aria-live="polite">
        {status.kind === 'saving' ? (
          <span className="inline-flex items-center gap-2 text-fg-muted">
            <Spinner className="size-4" />
            Guardando…
          </span>
        ) : status.kind === 'saved' ? (
          <span role="status" className="notice-in inline-flex items-center gap-1.5 text-court-ink">
            <Icon name="check" className="size-4" />
            Guardado<span className="sr-only">: {label}</span>
          </span>
        ) : status.kind === 'error' ? (
          <span role="alert" className="inline-flex flex-wrap items-center gap-2 text-danger">
            <Icon name="alert" className="size-4" />
            {status.message}
            <button type="button" onClick={save} className="min-h-11 font-semibold underline underline-offset-4">
              Reintentar
            </button>
          </span>
        ) : null}
      </div>
    </form>
  )
}
