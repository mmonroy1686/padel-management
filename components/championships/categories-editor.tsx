import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { Field, inputClasses } from '@/components/ui/field'
import {
  CATEGORY_DEFAULTS,
  CATEGORY_FORMATS,
  CATEGORY_GENDERS,
  FORMAT_LABELS,
  GENDER_LABELS,
  SEEDING_LABELS,
  SEEDINGS,
  THIRD_SET_LABELS,
  THIRD_SETS,
} from '@/lib/domain/championships'
import { CATEGORIES } from '@/lib/domain/profile'

export type CategoryItem = { id: string; name: string; detail: string }

function NumberField({ id, name, label, min, max, value }: { id: string; name: string; label: string; min: number; max: number; value: number }) {
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} name={name} type="number" inputMode="numeric" min={min} max={max} required defaultValue={value} className={inputClasses} />
    </Field>
  )
}

// Design: "categorías (filas con valores por defecto)". Only in a draft; after that, categories are merged or
// cancelled.
export function CategoriesEditor({
  championshipId,
  categories,
  addAction,
  deleteAction,
}: {
  championshipId: string
  categories: CategoryItem[]
  addAction: FormAction
  deleteAction: FormAction
}) {
  return (
    <section aria-labelledby="categorias-del-campeonato" className="flex flex-col gap-3">
      <h2 id="categorias-del-campeonato" className="font-display text-2xl font-bold uppercase">
        Categorías
      </h2>
      {categories.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {categories.map((category) => (
            <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
              <p>
                <span className="font-semibold">{category.name}</span>
                <span className="text-fg-muted"> · {category.detail}</span>
              </p>
              <ActionForm action={deleteAction} submitLabel="Quitar" pendingLabel="Quitando…" variant="ghost">
                <input type="hidden" name="categoryId" value={category.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted">Todavía no hay categorías.</p>
      )}
      <ActionForm action={addAction} submitLabel="Agregar categoría" pendingLabel="Agregando…" variant="secondary">
        <input type="hidden" name="championshipId" value={championshipId} />
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Nombre" htmlFor="category-name">
            <input id="category-name" name="name" required maxLength={40} placeholder="6ta Libre" className={inputClasses} />
          </Field>
          <Field label="Género" htmlFor="category-gender">
            <select id="category-gender" name="gender" defaultValue={CATEGORY_DEFAULTS.gender} className={inputClasses}>
              {CATEGORY_GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {GENDER_LABELS[gender]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Precio por pareja" htmlFor="category-price">
            <input id="category-price" name="price" type="number" inputMode="numeric" min={0} required
              defaultValue={CATEGORY_DEFAULTS.price} className={inputClasses} />
          </Field>
          <Field label="Categoría desde" htmlFor="category-level-min">
            <select id="category-level-min" name="levelMin" defaultValue="" className={inputClasses}>
              <option value="">Cualquiera</option>
              {CATEGORIES.map((level) => (
                <option key={level} value={level}>
                  {level}ª
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría hasta" htmlFor="category-level-max">
            <select id="category-level-max" name="levelMax" defaultValue="" className={inputClasses}>
              <option value="">Cualquiera</option>
              {CATEGORIES.map((level) => (
                <option key={level} value={level}>
                  {level}ª
                </option>
              ))}
            </select>
          </Field>
          <NumberField id="category-min" name="minPairs" label="Mínimo de parejas" min={2} max={64} value={CATEGORY_DEFAULTS.minPairs} />
          <NumberField id="category-max" name="maxPairs" label="Máximo de parejas" min={2} max={64} value={CATEGORY_DEFAULTS.maxPairs} />
          <Field label="Formato" htmlFor="category-format">
            <select id="category-format" name="format" defaultValue={CATEGORY_DEFAULTS.format} className={inputClasses}>
              {CATEGORY_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {FORMAT_LABELS[format]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Parejas por zona" htmlFor="category-group-size">
            <select id="category-group-size" name="groupSize" defaultValue={CATEGORY_DEFAULTS.groupSize} className={inputClasses}>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </Field>
          <NumberField id="category-qualifiers" name="qualifiers" label="Clasifican por zona" min={1} max={3} value={CATEGORY_DEFAULTS.qualifiers} />
          <NumberField id="category-minutes" name="matchMinutes" label="Minutos por partido" min={30} max={240} value={CATEGORY_DEFAULTS.matchMinutes} />
          <Field label="Cabezas de serie" htmlFor="category-seeding">
            <select id="category-seeding" name="seeding" defaultValue={CATEGORY_DEFAULTS.seeding} className={inputClasses}>
              {SEEDINGS.map((seeding) => (
                <option key={seeding} value={seeding}>
                  {SEEDING_LABELS[seeding]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tiempo de juego" htmlFor="category-time-mode">
            <select id="category-time-mode" name="timeLimitMode" defaultValue="none" className={inputClasses}>
              <option value="none">Sin límite: al mejor de 3 sets</option>
              <option value="timed">Con límite de tiempo</option>
            </select>
          </Field>
          <NumberField id="category-time-limit" name="timeLimit" label="Minutos de juego, si hay límite" min={20} max={240} value={60} />
          <Field label="Tercer set" htmlFor="category-third-set">
            <select id="category-third-set" name="thirdSet" defaultValue={CATEGORY_DEFAULTS.thirdSet} className={inputClasses}>
              {THIRD_SETS.map((thirdSet) => (
                <option key={thirdSet} value={thirdSet}>
                  {THIRD_SET_LABELS[thirdSet]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" name="goldenPoint" className="size-5 accent-accent" />
          Punto de oro
        </label>
      </ActionForm>
    </section>
  )
}
