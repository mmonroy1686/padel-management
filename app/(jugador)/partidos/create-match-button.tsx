'use client'

import { useState } from 'react'
import { CreateMatchSheet } from '@/components/matches/create-match-sheet'
import type { FormAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import type { MatchFormOptions } from '@/lib/domain/matches'

export function CreateMatchButton({ options, action }: { options: MatchFormOptions; action: FormAction }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Armar partido</Button>
      <CreateMatchSheet open={open} onClose={() => setOpen(false)} action={action} options={options} />
    </>
  )
}
