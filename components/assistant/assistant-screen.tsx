'use client'

import { useState } from 'react'
import { BuildMatchSheet } from '@/components/assistant/build-match-sheet'
import { FreeBoard } from '@/components/assistant/free-board'
import { RecommendedSlots } from '@/components/assistant/recommended-slots'
import type { CreateMatchAction, InviteAction } from '@/lib/actions/result'
import type { AssistantBoard, BoardSlot } from '@/lib/domain/assistant-board'

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
}: {
  board: AssistantBoard
  recommended: { slot: BoardSlot; text: string }[]
  timezone: string
  closeMinutes: number
  siteUrl: string
  createAction: CreateMatchAction
  inviteAction: InviteAction
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
          onClose={() => setPicked(null)}
        />
      ) : null}
    </>
  )
}
