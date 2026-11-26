'use client'

import { useState } from 'react'
import { BuildMatchSheet } from '@/components/assistant/build-match-sheet'
import { FreeBoard } from '@/components/assistant/free-board'
import { RecommendedSlots } from '@/components/assistant/recommended-slots'
import type { CreateMatchAction, InviteAction } from '@/lib/actions/result'
import type { AssistantBoard, BoardSlot } from '@/lib/domain/assistant-board'
import type { PlayerContact } from '@/lib/domain/contact'

// The recommendations and the board open the same sheet. The sheet keeps its slot while the page refreshes
// after creating or inviting.
export function AssistantScreen({
  board,
  recommended,
  timezone,
  closeMinutes,
  siteUrl,
  createAction,
  inviteAction,
  whatsapp,
}: {
  board: AssistantBoard
  recommended: { slot: BoardSlot; text: string }[]
  timezone: string
  closeMinutes: number
  siteUrl: string
  createAction: CreateMatchAction
  inviteAction: InviteAction
  // The WhatsApp of the members who accepted it, by player.
  whatsapp: Record<string, PlayerContact>
}) {
  const [picked, setPicked] = useState<BoardSlot | null>(null)
  return (
    <>
      <RecommendedSlots items={recommended} onPick={setPicked} />
      <FreeBoard board={board} closeMinutes={closeMinutes} onPick={setPicked} />
      {picked ? (
        <BuildMatchSheet
          key={picked.key}
          slot={picked}
          timezone={timezone}
          siteUrl={siteUrl}
          createAction={createAction}
          inviteAction={inviteAction}
          whatsapp={whatsapp}
          onClose={() => setPicked(null)}
        />
      ) : null}
    </>
  )
}
