import { ActionForm, type FormAction } from '@/components/ui/action-form'
import type { ButtonSize } from '@/components/ui/button'
import { deskChargeLabel, type DeskMethod } from '@/lib/domain/payments'

// "Cobrar $400" at the desk: one button per method the club takes there (Efectivo, POS). With only cash it is the
// single "Cobrar $400" it always was. The method goes in the form; the action records it.
export function DeskCharge({
  action,
  methods,
  label,
  fields,
  size,
  onDone,
}: {
  action: FormAction
  methods: readonly DeskMethod[]
  label: string
  fields: Record<string, string | number>
  size?: ButtonSize
  onDone?: (message: string) => void
}) {
  if (methods.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {methods.map((method) => (
        <ActionForm
          key={method}
          action={action}
          submitLabel={deskChargeLabel(label, method, methods)}
          pendingLabel="Registrando…"
          variant="secondary"
          size={size}
          onDone={onDone}
        >
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <input type="hidden" name="method" value={method} />
        </ActionForm>
      ))}
    </div>
  )
}
