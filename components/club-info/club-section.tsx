import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { mapStart, type ClubInfoView } from '@/lib/domain/club-info'
import { LazyClubMap } from './lazy-club-map'
import { PhotoStrip } from './photo-strip'

// «El club» at the end of Inicio, with and without a session: only what the club loaded (clubInfoView decides).
export function ClubSection({ view, clubName, timezone }: { view: ClubInfoView; clubName: string; timezone: string }) {
  return (
    <section aria-labelledby="el-club" className="flex flex-col gap-3">
      <h2 id="el-club" className="text-lg font-semibold">
        El club
      </h2>
      {view.photos.length > 0 ? <PhotoStrip photos={view.photos} clubName={clubName} /> : null}
      <Card className="flex flex-col gap-4">
        {view.contacts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {view.contacts.map((contact, index) => (
              <a key={contact.kind} href={contact.href} target={contact.kind === 'email' ? undefined : '_blank'} rel="noopener noreferrer"
                aria-label={`${contact.label}: ${contact.detail}`}
                className={buttonClasses({ variant: index === 0 && contact.kind === 'whatsapp' ? 'primary' : 'secondary' })}>
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
    </section>
  )
}
