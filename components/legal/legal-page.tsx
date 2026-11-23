import type { ReactNode } from 'react'
import { GAP, gapsIn, type LegalDocument } from '@/lib/legal/documents'

// A legal page: plain reading text. Every "[COMPLETAR: …]" is highlighted, and while any is left a banner on top says
// the text is a draft, so it can't go out unfinished by mistake.
export function LegalPage({ document }: { document: LegalDocument }) {
  const gaps = gapsIn(document)
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      {gaps.length > 0 ? (
        <p role="note" className="rounded-xl border border-accent bg-surface p-3 text-sm">
          <strong>Borrador.</strong> Este texto todavía no es definitivo: faltan {gaps.length} {gaps.length === 1 ? 'dato' : 'datos'} por
          completar y una revisión legal.
        </p>
      ) : null}
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-4xl font-bold uppercase">{document.title}</h1>
        <p className="text-sm text-fg-muted">Vigente desde: {withGaps(document.updated)}</p>
      </header>
      <p className="leading-relaxed">{withGaps(document.intro)}</p>
      {document.sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-bold uppercase">{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed">
              {withGaps(paragraph)}
            </p>
          ))}
          {section.items ? (
            <ul className="flex list-disc flex-col gap-1 pl-5 leading-relaxed">
              {section.items.map((item) => (
                <li key={item}>{withGaps(item)}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </main>
  )
}

function withGaps(text: string): ReactNode {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(GAP)) {
    parts.push(text.slice(last, match.index))
    parts.push(
      <mark key={match.index} className="rounded bg-accent/30 px-1 text-fg">
        {match[0]}
      </mark>,
    )
    last = (match.index ?? 0) + match[0].length
  }
  parts.push(text.slice(last))
  return parts
}
