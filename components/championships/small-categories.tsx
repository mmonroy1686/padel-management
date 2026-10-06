import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'

// Design: "Al cerrar, categorías con pocas parejas marcadas con Fusionar con… y Cancelar categoría".
export function SmallCategories({
  categories,
  targets,
  actions,
}: {
  categories: { id: string; name: string; text: string }[]
  targets: { id: string; name: string }[]
  actions: { merge: FormAction; cancel: FormAction }
}) {
  return (
    <section aria-labelledby="pocas-parejas" className="flex flex-col gap-3 rounded-2xl border border-accent p-4">
      <h2 id="pocas-parejas" className="font-display text-2xl font-bold uppercase">
        Categorías con pocas parejas
      </h2>
      <p className="text-sm text-fg-muted">
        No llegan al mínimo. Fusionalas con otra (las parejas que no entran quedan en espera) o cancelalas (lo cobrado queda en
        Cobros para devolver). A las parejas les llega un aviso.
      </p>
      <ul className="flex flex-col gap-3">
        {categories.map((category) => {
          const others = targets.filter((target) => target.id !== category.id)
          return (
            <li key={category.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
              <p>
                <span className="font-semibold">{category.name}</span>: {category.text}
              </p>
              {others.length > 0 ? (
                <ActionForm action={actions.merge} submitLabel="Fusionar" pendingLabel="Fusionando…" variant="secondary">
                  <input type="hidden" name="categoryId" value={category.id} />
                  <Field label={`Fusionar ${category.name} con`} htmlFor={`merge-${category.id}`}>
                    <select id={`merge-${category.id}`} name="intoId" className={inputClasses}>
                      {others.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </ActionForm>
              ) : null}
              <ActionForm action={actions.cancel} submitLabel="Cancelar categoría" pendingLabel="Cancelando…" variant="danger">
                <input type="hidden" name="categoryId" value={category.id} />
              </ActionForm>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
