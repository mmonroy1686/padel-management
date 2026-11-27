import { Icon } from '@/components/ui/icon'
import { shortDate } from '@/lib/domain/format'
import type { MilestoneGroup } from '@/lib/domain/platform-trial'
import { localDateOf } from '@/lib/domain/time'
import { cn } from '@/lib/cn'

// The trial's milestones in the order a club reaches them: done ones with their date, missing ones with how far they
// are. The first missing one is the next step, marked in words as well as weight.
export function MilestoneList({ groups, timezone, nextKey }: { groups: MilestoneGroup[]; timezone: string; nextKey: string | null }) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-fg-muted">{group.title}</h3>
          <ul className="flex flex-col divide-y divide-border">
            {group.milestones.map((milestone) => {
              const isNext = milestone.key === nextKey
              return (
                <li key={milestone.key} className="flex min-h-11 items-center gap-3 py-2">
                  {milestone.done ? (
                    <Icon name="check-circle" className="size-5 shrink-0 text-fg" />
                  ) : (
                    <span aria-hidden="true" className={cn('size-5 shrink-0 rounded-full border-2', isNext ? 'border-fg' : 'border-border')} />
                  )}
                  <span className={cn('min-w-0 flex-1', milestone.done ? 'text-fg' : isNext ? 'font-semibold' : 'text-fg-muted')}>
                    {milestone.label}
                    <span className="sr-only">{milestone.done ? ': cumplido' : ': falta'}</span>
                    {isNext ? <span className="ml-2 text-sm font-normal text-fg-muted">Próximo paso</span> : null}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-fg-muted">
                    {milestone.at ? shortDate(localDateOf(milestone.at, timezone)) : milestone.progress}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
