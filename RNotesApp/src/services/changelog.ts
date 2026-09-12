export type ChangeKind = 'added' | 'fixed' | 'changed' | 'deleted'

export interface ChangeSection {
  kind: ChangeKind
  items: string[]
}

export interface Changelog {
  version: string
  sections: ChangeSection[]
  plain: string[]
}

const KINDS: ChangeKind[] = ['added', 'fixed', 'changed', 'deleted']

const COLON_FORM = new RegExp(`\\b(${KINDS.join('|')})\\s*:`, 'gi')
const BARE_FORM = new RegExp(`(?:^|[,.;:]\\s|[-*]\\s)\\s*(${KINDS.join('|')})\\b`, 'gim')

const stripBulletList = (text: string) => text.replace(/^\s*[-*•]\s*/, '').trim()

function splitFeaturedItems(text: string): string[] {
  const body = text.trim()
  if (!body) return []

  const parts = body
    .split(/\n+|(?:^|\s)[-*•]\s+/)
    .map((part) => stripBulletList(part))
    .filter(Boolean)

  return parts.length ? parts : [body]
}

export function parseReleaseNotes(body: string, fallbackVersion = ''): Changelog {
  const text = (body ?? '').replace(/\r\n/g, '\n').trim()

  const version = (text.match(/\b\d+\.\d+(?:\.\d+)*\b/)?.[0] ?? fallbackVersion).replace(/^v/i, '')
  const colonMatches = [...text.matchAll(COLON_FORM)]
  const matches = colonMatches.length ? colonMatches : [...text.matchAll(BARE_FORM)].slice(0, 1)

  const sections: ChangeSection[] = []
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const kind = match[1].toLowerCase() as ChangeKind
    const from = match.index! + match[0].length
    const to = i + 1 < matches.length ? matches[i + 1].index! : text.length
    const items = splitFeaturedItems(text.slice(from, to))
    if (items.length) sections.push({ kind, items })
  }

  if (sections.length) return { version, sections, plain: [] }

  const plain = text
    .split('\n')
    .map((line) => stripBulletList(line).replace(/^update\s+version\s+to\s+v?\d+(?:\.\d+)*\s*[,:-]?\s*/i, ''))
    .filter(Boolean)

  return { version, sections: [], plain }
}
