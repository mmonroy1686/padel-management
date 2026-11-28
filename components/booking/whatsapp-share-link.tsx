import { BrandIcon } from '@/components/ui/brand-icon'
import { buttonClasses, type ButtonSize } from '@/components/ui/button'
import { whatsappUrl } from '@/lib/domain/match-share'

// Opens WhatsApp with the message ready, for the player to pick the chat or group.
export function WhatsappShareLink({ text, label = 'Compartir por WhatsApp', size = 'sm' }: { text: string; label?: string; size?: ButtonSize }) {
  return (
    <a
      href={whatsappUrl(text)}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClasses({ variant: 'secondary', size, className: 'gap-2' })}
    >
      <BrandIcon name="whatsapp" className="size-5" />
      {label}
    </a>
  )
}
