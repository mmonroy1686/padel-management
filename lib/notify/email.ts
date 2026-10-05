export type EmailMessage = { to: string; subject: string; html: string; text: string }

// Sends one mail or throws. Resend is the first implementation; another provider only has to match it.
export type EmailSender = (message: EmailMessage) => Promise<void>

const RESEND_URL = 'https://api.resend.com/emails'

// Resend's HTTP API with fetch: no SDK needed.
export function resendSender({
  apiKey,
  from,
  fetchImpl = fetch,
}: {
  apiKey: string
  from: string
  fetchImpl?: typeof fetch
}): EmailSender {
  return async (message) => {
    const response = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
    })
    if (!response.ok) throw new Error(`Resend respondió ${response.status}`)
  }
}

// Without RESEND_API_KEY and EMAIL_FROM nothing is mailed: avisos stay in the app.
export function emailSenderFromEnv(env: Record<string, string | undefined> = process.env): EmailSender | null {
  const apiKey = env.RESEND_API_KEY?.trim()
  const from = env.EMAIL_FROM?.trim()
  return apiKey && from ? resendSender({ apiKey, from }) : null
}
