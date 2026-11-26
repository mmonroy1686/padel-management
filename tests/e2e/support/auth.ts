import { expect, type Page } from '@playwright/test'
import { localSupabase } from './env'

type MailpitSearch = { messages: { ID: string }[] }
type MailpitMessage = { HTML: string; Text: string }

// Asks Ingresar for the sign-in mail (it carries the 6-digit code and the link).
async function askForMail(page: Page, email: string, next: string, origin: string): Promise<void> {
  await page.goto(`${origin}/auth/ingreso?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Mandarme un código' }).click()
  await expect(page.getByRole('status').first()).toContainText('Te mandamos un mail')
}

// Signs in through the real UI following the mail's link from Mailpit, in the same browser that asked for it (the PKCE
// verifier lives in its cookies). `origin` signs in on another club's subdomain (http://norte.localhost:3000): one
// session per club.
export async function signInWithMagicLink(page: Page, email: string, next = '/', origin = ''): Promise<void> {
  await askForMail(page, email, next, origin)
  const html = await latestMailFor(email)
  const link = /href="([^"]*\/auth\/v1\/verify[^"]*)"/.exec(html)
  if (!link) throw new Error(`El mail de ${email} no trae el enlace`)
  await page.goto(link[1].replaceAll('&amp;', '&'))
}

// Signs in typing the mail's 6-digit code on Ingresar (no link opened).
export async function signInWithCode(page: Page, email: string, next = '/', origin = ''): Promise<void> {
  await askForMail(page, email, next, origin)
  const code = /id="sign-in-code"[^>]*>\s*(\d{6})\s*</.exec(await latestMailFor(email))
  if (!code) throw new Error(`El mail de ${email} no trae el código`)
  await page.getByLabel('Código del mail').fill(code[1])
}

async function latestMailFor(email: string): Promise<string> {
  const { mailpitUrl } = localSupabase()
  const query = encodeURIComponent(`to:"${email}"`)
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = (await (await fetch(`${mailpitUrl}/api/v1/search?query=${query}`)).json()) as MailpitSearch
    const [latest] = search.messages
    if (latest) {
      const message = (await (await fetch(`${mailpitUrl}/api/v1/message/${latest.ID}`)).json()) as MailpitMessage
      if (message.HTML.includes('/auth/v1/verify')) return message.HTML
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No llegó el mail para entrar a ${email}`)
}
