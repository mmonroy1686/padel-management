import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import type { TrialTone } from '@/lib/domain/platform-trial'

// The club's status and its trial in one line. Ink, not the club's color: a trial ending is information, and an
// over one says so in the danger color with its icon (never by color alone).
export function TrialBadge({ text, tone }: { text: string; tone: TrialTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm',
        tone === 'over' ? 'font-semibold text-danger' : tone === 'soon' ? 'font-semibold text-fg' : 'text-fg-muted',
      )}
    >
      {tone === 'over' || tone === 'soon' ? <Icon name={tone === 'over' ? 'alert' : 'clock'} className="size-4 shrink-0" /> : null}
      {text}
    </span>
  )
}
