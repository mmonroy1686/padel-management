import { inputClasses } from '@/components/ui/field'
import { TIME_OPTIONS } from '@/lib/domain/settings'
import { formatMinutes, parseTime } from '@/lib/domain/time'

// "08:00:00" from the database as the select shows it.
export const hhmm = (value: string) => formatMinutes(parseTime(value))

export function TimeSelect({ id, name, value }: { id: string; name: string; value: string }) {
  return (
    <select id={id} name={name} defaultValue={value} className={inputClasses}>
      {TIME_OPTIONS.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  )
}
