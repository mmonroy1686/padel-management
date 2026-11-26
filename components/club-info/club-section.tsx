import { BrandIcon } from '@/components/ui/brand-icon'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { mapStart, type ClubInfoView } from '@/lib/domain/club-info'
import { LazyClubMap } from './lazy-club-map'
import { PhotoStrip } from './photo-strip'

// «El club» at the end of Inicio, with and without a session: only what the club loaded (clubInfoView decides).
// folded (a player signed in, who has seen it before): one line that opens it, so Inicio stays about their next game;
// the map loads only once it is open.
export function ClubSection({ view, clubName, timezone, folded = false }: { view: ClubInfoView; clubName: string; timezone: string; folded?: boolean }) {
  if (folded) {
    return (
      <details className="group border-y border-border">
        <summary className="flex min-h-14 cursor-pointer items-center gap-3 py-2.5">
          <Icon name="pin" className="text-accent-ink" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">El club</span>
            <span className="block text-sm text-fg-muted">Contacto, cómo llegar, horarios y servicios</span>
          </span>
          <Icon name="chevron-right" className="size-5 text-fg-muted transition-transform group-open:rotate-90" />
        </summary>
        <div className="pb-4">
          <ClubDetails view={view} clubName={clubName} timezone={timezone} />
        </div>
      </details>
    )
  }
  return (
    <section aria-labelledby="el-club" className="flex flex-col gap-3">
      <h2 id="el-club" className="text-lg font-semibold">
        El club
      </h2>
      <ClubDetails view={view} clubName={clubName} timezone={timezone} />
    </section>
  )
}

function ClubDetails({ view, clubName, timezone }: { view: ClubInfoView; clubName: string; timezone: string }) {
  return (
    <div className="flex flex-col gap-3">
      {view.photos.length > 0 ? <PhotoStrip photos={view.photos} clubName={clubName} /> : null}
      <Card className="flex flex-col gap-4">
        {view.contacts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {view.contacts.map((contact) => (
              <a key={contact.kind} href={contact.href} target={contact.kind === 'email' ? undefined : '_blank'} rel="noopener noreferrer"
                aria-label={`${contact.label}: ${contact.detail}`}
                className={buttonClasses({ variant: 'secondary' })}>
                {contact.kind === 'email' ? <Icon name="mail" /> : <BrandIcon name={contact.kind} />}
                {contact.label}
              </a>
            ))}
          </div>
        ) : null}
        {view.address || view.pin ? (
          <div className="flex flex-col gap-2">
            {view.address ? (
              <p className="flex items-start gap-2">
                <Icon name="pin" className="mt-0.5 shrink-0 text-accent-ink" />
                {view.address}
              </p>
            ) : null}
            {view.pin ? (
              <LazyClubMap whenVisible pin={view.pin} fallback={mapStart(timezone)} mode="view" label={`Mapa de ${clubName}`} />
            ) : null}
          </div>
        ) : null}
        {view.directions ? (
          <a href={view.directions} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
            Cómo llegar
          </a>
        ) : null}
        <p className="flex items-center gap-2 text-fg-muted">
          <Icon name="clock" className="shrink-0" />
          {view.hours}
        </p>
        {view.amenities.length > 0 ? (
          <ul aria-label="Servicios" className="flex flex-wrap gap-2">
            {view.amenities.map((amenity) => (
              <li key={amenity} className="flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-bg px-3 text-sm">
                <Icon name="check" className="size-4 text-accent-ink" />
                {amenity}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  )
}
