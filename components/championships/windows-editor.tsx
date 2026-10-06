import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'

export type WindowItem = { id: string; text: string; courts: string }

// Design: "ventanas (filas día, desde, hasta, canchas)". Only in a draft: once registration opens, each day of
// play blocks its courts.
export function WindowsEditor({
  championshipId,
  windows,
  courts,
  fromTimes,
  toTimes,
  today,
  addAction,
  deleteAction,
}: {
  championshipId: string
  windows: WindowItem[]
  courts: { id: string; name: string }[]
  fromTimes: string[]
  toTimes: string[]
  today: string
  addAction: FormAction
  deleteAction: FormAction
}) {
  return (
    <section aria-labelledby="dias-de-juego" className="flex flex-col gap-3">
      <h2 id="dias-de-juego" className="font-display text-2xl font-bold uppercase">
        Días de juego
      </h2>
      {windows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {windows.map((window) => (
            <li key={window.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
              <p>
                <span className="font-semibold">{window.text}</span>
                <span className="text-fg-muted"> · {window.courts}</span>
              </p>
              <ActionForm action={deleteAction} submitLabel="Quitar" pendingLabel="Quitando…" variant="ghost">
                <input type="hidden" name="windowId" value={window.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted">Todavía no hay días de juego.</p>
      )}
      <ActionForm action={addAction} submitLabel="Agregar día" pendingLabel="Agregando…" variant="secondary">
        <input type="hidden" name="championshipId" value={championshipId} />
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Día" htmlFor="window-date">
            <input id="window-date" name="date" type="date" min={today} required className={inputClasses} />
          </Field>
          <Field label="Desde" htmlFor="window-from">
            <select id="window-from" name="fromTime" defaultValue={fromTimes[0]} className={inputClasses}>
              {fromTimes.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hasta" htmlFor="window-to">
            <select id="window-to" name="toTime" defaultValue={toTimes[toTimes.length - 1]} className={inputClasses}>
              {toTimes.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Canchas</legend>
          <div className="flex flex-wrap gap-4">
            {courts.map((court) => (
              <label key={court.id} className="inline-flex min-h-11 items-center gap-2">
                <input type="checkbox" name="courtIds" value={court.id} defaultChecked className="size-5 accent-accent" />
                {court.name}
              </label>
            ))}
          </div>
        </fieldset>
      </ActionForm>
    </section>
  )
}
