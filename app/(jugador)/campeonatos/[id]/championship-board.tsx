'use client'

import { useCallback, useState } from 'react'
import { TransferSheet, type ReportTransfer } from '@/components/booking/transfer-sheet'
import { MyEntryCard, type MyEntryView } from '@/components/championships/my-entry-card'
import { RegisterSheet, type RegisterOption } from '@/components/championships/register-sheet'
import { UnavailabilitySheet } from '@/components/championships/unavailability-sheet'
import { ActionForm, type FormAction } from '@/components/ui/action-form'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import type { Block } from '@/lib/domain/championships'
import type { MemberOption } from '@/lib/domain/members'

// A category as the page prepares it: reason says why the viewer cannot sign up to it.
export type BoardCategory = RegisterOption & { spots: string; reason: string | null }
export type BoardEntry = MyEntryView & { unavailable: string[]; note: string | null }
export type ChampionshipBoardProps = {
  name: string
  statusLabel: string
  cancelled: boolean
  dates: string[]
  closes: string | null
  rules: string
  posterUrl: string | null
  paymentNote: string
  categories: BoardCategory[]
  entries: BoardEntry[]
  blocks: Block[]
  maxUnavailable: number
  members: MemberOption[]
  myLevel: number | null
  viewerId: string
  transfer: { details: string | null; receiptRequired: boolean }
  initialCategoryId: string | null
  actions: { register: FormAction; withdraw: FormAction; hours: FormAction; report: ReportTransfer }
}

type Sheet = { kind: 'register'; categoryId: string | null } | { kind: 'pay' | 'hours' | 'leave'; entry: BoardEntry }

// Design: "/campeonatos/[id]": dates, rules and poster; categories with their places and "Anotarme"; your
// pairs with their payment, hours and "Darme de baja". It is also where a shared link lands.
export function ChampionshipBoard(props: ChampionshipBoardProps) {
  const { initialCategoryId } = props
  const [sheet, setSheet] = useState<Sheet | null>(
    initialCategoryId && props.categories.some((category) => category.id === initialCategoryId && category.available)
      ? { kind: 'register', categoryId: initialCategoryId }
      : null,
  )
  const [notice, setNotice] = useState<string | null>(null)
  const close = useCallback(() => setSheet(null), [])
  const done = useCallback((message: string) => {
    setSheet(null)
    setNotice(message)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase">{props.name}</h1>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{props.statusLabel}</span>
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border border-accent bg-surface p-3">
          {notice}
        </p>
      ) : null}
      {props.cancelled ? (
        <p role="note" className="rounded-xl border border-accent p-3">
          El club canceló este campeonato. Si pagaste, te devuelve la plata.
        </p>
      ) : null}
      {props.posterUrl ? (
        // A plain img: the poster comes from Supabase Storage and next/image would need its host configured.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.posterUrl} alt={`Afiche de ${props.name}`} className="max-h-96 w-full rounded-2xl object-contain" />
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-fg-muted">Cuándo</dt>
        <dd>
          <ul>
            {props.dates.map((date) => (
              <li key={date}>{date}</li>
            ))}
          </ul>
        </dd>
        {props.closes ? (
          <>
            <dt className="text-fg-muted">Inscripción</dt>
            <dd>Hasta el {props.closes}</dd>
          </>
        ) : null}
        <dt className="text-fg-muted">Pago</dt>
        <dd>Uno por pareja. {props.paymentNote}</dd>
      </dl>
      {props.rules ? (
        <section aria-labelledby="reglamento" className="flex flex-col gap-2">
          <h2 id="reglamento" className="font-display text-2xl font-bold uppercase">
            Reglamento
          </h2>
          <p className="whitespace-pre-line">{props.rules}</p>
        </section>
      ) : null}

      {props.entries.length > 0 ? (
        <section aria-labelledby="mis-inscripciones" className="flex flex-col gap-3">
          <h2 id="mis-inscripciones" className="font-display text-2xl font-bold uppercase">
            Tus inscripciones
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {props.entries.map((entry) => (
              <li key={entry.entryId}>
                <MyEntryCard
                  view={entry}
                  onPay={() => setSheet({ kind: 'pay', entry })}
                  onHours={() => setSheet({ kind: 'hours', entry })}
                  onLeave={() => setSheet({ kind: 'leave', entry })}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="categorias" className="flex flex-col gap-3">
        <h2 id="categorias" className="font-display text-2xl font-bold uppercase">
          Categorías
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {props.categories.map((category) => (
            <li key={category.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{category.name}</p>
                <span className="shrink-0 text-sm text-fg-muted tabular-nums">{category.spots}</span>
              </div>
              <p className="text-sm text-fg-muted">{category.detail}</p>
              {category.available ? (
                <Button
                  aria-label={`Anotarme en ${category.name}`}
                  variant={category.full ? 'secondary' : 'primary'}
                  onClick={() => setSheet({ kind: 'register', categoryId: category.id })}
                >
                  {category.full ? 'Anotarme en espera' : 'Anotarme'}
                </Button>
              ) : category.reason ? (
                <p className="text-sm text-fg-muted">{category.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {sheet?.kind === 'register' ? (
        <RegisterSheet
          options={props.categories}
          initialCategoryId={sheet.categoryId}
          myLevel={props.myLevel}
          members={props.members}
          action={props.actions.register}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {sheet?.kind === 'hours' ? (
        <UnavailabilitySheet
          entryId={sheet.entry.entryId}
          blocks={props.blocks}
          selected={sheet.entry.unavailable}
          note={sheet.entry.note}
          max={props.maxUnavailable}
          action={props.actions.hours}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {sheet?.kind === 'pay' && sheet.entry.payment ? (
        <TransferSheet
          bookingId={sheet.entry.entryId}
          userId={props.viewerId}
          amount={sheet.entry.payment.due}
          details={props.transfer.details}
          receiptRequired={props.transfer.receiptRequired}
          reportAction={props.actions.report}
          onClose={close}
          onDone={done}
        />
      ) : null}
      <BottomSheet open={sheet?.kind === 'leave'} onClose={close} title="Darme de baja">
        {sheet?.kind === 'leave' ? (
          <>
            <p className="mb-4">
              Se da de baja la pareja con {sheet.entry.partnerName} en {sheet.entry.categoryName}. Si ya pagaron, el club les
              devuelve la plata.
            </p>
            <ActionForm action={props.actions.withdraw} submitLabel="Sí, darnos de baja" pendingLabel="Saliendo…" onDone={done}>
              <input type="hidden" name="entryId" value={sheet.entry.entryId} />
            </ActionForm>
          </>
        ) : null}
      </BottomSheet>
    </div>
  )
}
