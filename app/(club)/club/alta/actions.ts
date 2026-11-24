'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { failed, type ActionState } from '@/lib/actions/result'
import { getViewer } from '@/lib/auth/viewer'
import { errorMessage } from '@/lib/domain/errors'
import { createClient } from '@/lib/supabase/server'

// "Listo", the end of the setup assistant: the club is set up (it needs a court and a price) and the panel opens.
export async function finishSetup(): Promise<ActionState> {
  const viewer = await getViewer()
  if (viewer?.membership?.role !== 'admin') return failed(errorMessage('forbidden'))
  const supabase = await createClient()
  const { error } = await supabase.rpc('finish_club_setup', { p_club_id: viewer.club.id })
  if (error) return failed(errorMessage(error.message))
  revalidatePath('/', 'layout')
  redirect('/club/inicio')
}
