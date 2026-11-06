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

const KEYWORDS: Record<string, ChangeKind> = {
  added: 'added',
  fixed: 'fixed',
  changed: 'changed',
  deleted: 'deleted',
  agregado: 'added',
  corregido: 'fixed',
  cambiado: 'changed',
  eliminado: 'deleted',
}
const WORDS = Object.keys(KEYWORDS).join('|')

const COLON_FORM = new RegExp(`\\b(${WORDS})\\s*:`, 'gi')
const BARE_FORM = new RegExp(`(?:^|[,.;:]\\s|[-*]\\s)\\s*(${WORDS})\\b`, 'gim')

/** `[en]`, `[es]`, `[pt-br]`… alone on its line. A task box (`[x]`) has one letter, so it is not one. */
const LANGUAGE_TAG = /^[ \t]*\[([a-z]{2,3}(?:-[a-z0-9]+)?)\][ \t]*$/gim
const FALLBACK_LANGUAGE = 'en'


export function notesForLanguage(body: string, language: string): string {
  const text = (body ?? '').replace(/\r\n/g, '\n')
  const tags = [...text.matchAll(LANGUAGE_TAG)]
  if (!tags.length) return body ?? ''

  const blocks = tags.map((tag, i) => ({
    language: tag[1].toLowerCase(),
    text: text.slice(tag.index! + tag[0].length, i + 1 < tags.length ? tags[i + 1].index! : text.length).trim(),
  }))
  const wanted = (language || FALLBACK_LANGUAGE).toLowerCase()
  const base = wanted.split('-')[0]
  const chosen =
    blocks.find((block) => block.language === wanted) ??
    blocks.find((block) => block.language.split('-')[0] === base) ??
    blocks.find((block) => block.language === FALLBACK_LANGUAGE) ??
    blocks[0]

  const preamble = text.slice(0, tags[0].index!).trim()
  return preamble ? `${preamble}\n\n${chosen.text}` : chosen.text
}

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
    const kind = KEYWORDS[match[1].toLowerCase()]
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
