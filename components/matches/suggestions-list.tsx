import { buttonClasses } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { whatsappUrl } from '@/lib/domain/match-share'
import { inviteText, type SuggestionView } from '@/lib/domain/match-suggestions'

export function SuggestionsList({ suggestions, shareText }: { suggestions: SuggestionView[]; shareText: string }) {
  return (
    <section aria-labelledby="invita" className="flex flex-col gap-3">
      <h2 id="invita" className="font-display text-2xl font-bold uppercase">
        Invitá a quien le puede servir
      </h2>
      <p className="text-sm text-fg-muted">
        Cumplen la categoría y el lado que falta, y suelen jugar o estar libres a esta hora.
      </p>
      {suggestions.length === 0 ? (
        <p className="rounded-xl border border-border p-4 text-fg-muted">
          No encontramos jugadores disponibles con ese perfil. Compartilo en el grupo del club.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {suggestions.map((suggestion) => (
            <li key={suggestion.playerId} className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <p className="font-semibold">{suggestion.name}</p>
              <ul aria-label={`Por qué ${suggestion.name}`} className="flex flex-wrap gap-1">
                {suggestion.chips.map((chip) => (
                  <li
                    key={chip.text}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-xs',
                      chip.hit ? 'border-court-ink text-court-ink' : 'border-border text-fg-muted',
                    )}
                  >
                    {chip.text}
                  </li>
                ))}
              </ul>
              <a
                href={whatsappUrl(inviteText(suggestion.name, shareText))}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Invitar a ${suggestion.name} por WhatsApp`}
                className={buttonClasses({ variant: 'secondary' })}
              >
                Invitar por WhatsApp
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
