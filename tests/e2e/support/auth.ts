import { expect, type Page } from '@playwright/test'
import { localSupabase } from './env'

type MailpitSearch = { messages: { ID: string }[] }
type MailpitMessage = { HTML: string; Text: string }

// Signs in through the real UI: asks for a magic link and follows it from Mailpit, in the same
// browser that asked for it (the PKCE verifier lives in its cookies).
export async function signInWithMagicLink(page: Page, email: string, next = '/'): Promise<void> {
  await page.goto(`/auth/ingreso?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click()
  await expect(page.getByRole('status')).toContainText('Revisá tu email')
  await page.goto(await magicLinkFor(email))
}

async function magicLinkFor(email: string): Promise<string> {
  const { mailpitUrl } = localSupabase()
  const query = encodeURIComponent(`to:"${email}"`)
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = (await (await fetch(`${mailpitUrl}/api/v1/search?query=${query}`)).json()) as MailpitSearch
    const [latest] = search.messages
    if (latest) {
      const message = (await (await fetch(`${mailpitUrl}/api/v1/message/${latest.ID}`)).json()) as MailpitMessage
      const match =
        /href="([^"]*\/auth\/v1\/verify[^"]*)"/.exec(message.HTML) ??
        /(https?:\/\/\S*\/auth\/v1\/verify\S*)/.exec(message.Text)
      if (match) return match[1].replaceAll('&amp;', '&')
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No llegó el enlace mágico para ${email}`)
}
