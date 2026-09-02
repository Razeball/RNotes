import { invoke } from '@tauri-apps/api/core'
import { Editor, Element as SlateElement, Node, Path, Point, Range as SlateRange, Text, Transforms } from 'slate'
import type { EditorInstance } from '../editorActions'

/** Spell checker orchestrator coordinating between Rust backend and Slate editor by deciding when to request checks and mapping results onto Slate positions. */

export interface SpellIssue {
  /** UTF-16 offsets into the block's whole text which is what Slate offsets count in. */
  start: number
  end: number
  text: string
  rule: string
  suggestions: string[]
}

export interface LocatedIssue extends SpellIssue {
  blockPath: Path
  range: SlateRange
}

export const SPELL_RULES = [
  'spelling',
  'repeated-word',
  'double-space',
  'space-before-punctuation',
  'lowercase-after-period',
] as const

/** Issues keyed on block node object rather than path because paths shift when blocks move and stale paths would underline wrong words. */
const issueCache = new WeakMap<object, { text: string; issues: SpellIssue[] }>()

/** Returns true when a block holds text directly like paragraphs not wrappers like tables or lists. */
function isTextHoldingBlock(editor: EditorInstance, node: Node): boolean {
  if (!SlateElement.isElement(node) || !Editor.isBlock(editor, node)) return false
  if (node.type === 'image') return false
  return !node.children.some((child) => SlateElement.isElement(child) && Editor.isBlock(editor, child))
}

/** Collects all checkable blocks in the editor. */
function collectCheckableBlocks(editor: EditorInstance): [SlateElement, Path][] {
  return Array.from(
    Editor.nodes(editor, { at: [], match: (n) => isTextHoldingBlock(editor, n) })
  ) as [SlateElement, Path][]
}

/** Returns cached issues for a block or empty array when its text has changed since last check. */
export function getIssuesForBlock(block: Node): SpellIssue[] {
  const entry = issueCache.get(block as object)
  if (!entry) return []
  return entry.text === computeTextLayout(block).text ? entry.issues : []
}

const CHUNK_SIZE = 50

/** Returns true when any result moved so caller knows a repaint is worth it. */
export async function refreshSpellingChecks(
  editor: EditorInstance,
  language: string,
  onProgress?: () => void
): Promise<boolean> {
  const blocks = collectCheckableBlocks(editor)
  const staleEntries: { block: SlateElement; text: string }[] = []

  for (const [block] of blocks) {
    const text = Node.string(block)
    const entry = issueCache.get(block as object)
    if (!entry || entry.text !== text) staleEntries.push({ block, text })
  }

  if (staleEntries.length === 0) return false

  for (let start = 0; start < staleEntries.length; start += CHUNK_SIZE) {
    const batch = staleEntries.slice(start, start + CHUNK_SIZE)

    const results = await invoke<SpellIssue[][]>('check_spelling_batch', {
      blocks: batch.map((item) => item.text),
      language,
    })

    batch.forEach((entry, index) => {
      issueCache.set(entry.block as object, { text: entry.text, issues: results[index] ?? [] })
      decorationCache.delete(entry.block as object)
    })

    if (start + CHUNK_SIZE < staleEntries.length) onProgress?.()
  }

  return true
}

/** Suggestions for one word looked up when someone actually asks. The search is expensive — around 80ms a word against the Spanish dictionary — so it is deliberately absent from typing pass. Results are cached per word because a document repeats its mistakes: a hundred underlines are usually a handful of distinct words. */
const suggestionCache = new Map<string, string[]>()

export async function lookupSuggestions(word: string, language: string): Promise<string[]> {
  const key = `${language}::${word}`
  const cached = suggestionCache.get(key)
  if (cached) return cached

  const suggestions = await invoke<string[]>('suggest_single_word', { word, language })
  suggestionCache.set(key, suggestions)
  return suggestions
}

/** Returns whatever is already known for a word without going to the backend. */
export function getCachedSuggestions(word: string, language: string): string[] | undefined {
  return suggestionCache.get(`${language}::${word}`)
}

/** Clears all cached spelling check data from checkable blocks in the editor. */
export function clearSpellingCache(editor: EditorInstance): void {
  for (const [block] of collectCheckableBlocks(editor)) {
    issueCache.delete(block as object)
    decorationCache.delete(block as object)
  }
}

/** Returns where a text node starts inside its block counted the same way Node.string concatenates. */
export function getTextPositionInBlock(block: Node, blockPath: Path, textPath: Path): number {
  const relative = textPath.slice(blockPath.length).join()
  return computeTextLayout(block).byKey.get(relative)?.start ?? 0
}

interface TextLayout {
  text: string
  entries: { key: string; path: Path; start: number; length: number }[]
  byKey: Map<string, { path: Path; start: number; length: number }>
}

const layoutCache = new WeakMap<object, TextLayout>()

function computeTextLayout(block: Node): TextLayout {
  const cached = layoutCache.get(block as object)
  if (cached) return cached

  const entries: TextLayout['entries'] = []
  const byKey: TextLayout['byKey'] = new Map()
  let text = ''

  for (const [node, path] of Node.texts(block)) {
    const entry = { key: path.join(), path, start: text.length, length: node.text.length }
    entries.push(entry)
    byKey.set(entry.key, entry)
    text += node.text
  }

  const layout = { text, entries, byKey }
  layoutCache.set(block as object, layout)
  return layout
}

/** Converts a block-relative offset into a Slate point. */
function convertOffsetToPoint(block: Node, blockPath: Path, offset: number): Point | null {
  const { entries } = computeTextLayout(block)
  let last: Point | null = null

  for (const entry of entries) {
    if (offset <= entry.start + entry.length) {
      return { path: [...blockPath, ...entry.path], offset: offset - entry.start }
    }
    last = { path: [...blockPath, ...entry.path], offset: entry.length }
  }

  return last
}

/** Converts a block-relative issue into a Slate range by resolving anchor and focus points. */
export function convertIssueToRange(block: Node, blockPath: Path, issue: SpellIssue): SlateRange | null {
  const anchor = convertOffsetToPoint(block, blockPath, issue.start)
  const focus = convertOffsetToPoint(block, blockPath, issue.end)
  return anchor && focus ? { anchor, focus } : null
}

interface BlockDecorations {
  pathKey: string
  ranges: { start: number; end: number; payload: string }[]
}

const decorationCache = new WeakMap<object, BlockDecorations>()

function serializeBlockIssuesAsDecorations(block: Node, blockPath: Path): BlockDecorations['ranges'] {
  const pathKey = blockPath.join()
  const cached = decorationCache.get(block as object)
  if (cached && cached.pathKey === pathKey) return cached.ranges

  const ranges: BlockDecorations['ranges'] = []
  for (const issue of getIssuesForBlock(block)) {
    const range = convertIssueToRange(block, blockPath, issue)
    if (!range) continue
    ranges.push({
      start: issue.start,
      end: issue.end,
      payload: JSON.stringify({
        rule: issue.rule,
        text: issue.text,
        suggestions: issue.suggestions,
        range,
      }),
    })
  }

  decorationCache.set(block as object, { pathKey, ranges })
  return ranges
}

/** Clips spell decorations to a single text node. */
export function clipSpellDecorationsToNode(
  block: Node,
  blockPath: Path,
  textPath: Path,
  textLength: number
): SlateRange[] {
  const decorations = serializeBlockIssuesAsDecorations(block, blockPath)
  if (decorations.length === 0) return []

  const nodeStart = getTextPositionInBlock(block, blockPath, textPath)
  const nodeEnd = nodeStart + textLength
  const ranges: SlateRange[] = []

  for (const decoration of decorations) {
    if (decoration.end <= nodeStart || decoration.start >= nodeEnd) continue
    ranges.push({
      anchor: { path: textPath, offset: Math.max(0, decoration.start - nodeStart) },
      focus: { path: textPath, offset: Math.min(textLength, decoration.end - nodeStart) },
      spell: decoration.payload,
    } as SlateRange)
  }

  return ranges
}

/** Collects every cached issue in the document in reading order with its position resolved. */
export function collectAllLocatedIssues(editor: EditorInstance): LocatedIssue[] {
  const located: LocatedIssue[] = []

  for (const [block, blockPath] of collectCheckableBlocks(editor)) {
    for (const issue of getIssuesForBlock(block)) {
      const range = convertIssueToRange(block, blockPath, issue)
      if (range) located.push({ ...issue, blockPath, range })
    }
  }

  return located
}

/** Applies one correction by applying a replacement string to fix an issue. */
export function applySuggestedReplacement(editor: EditorInstance, issue: LocatedIssue, replacement: string): boolean {
  if (!Editor.hasPath(editor, issue.blockPath)) return false

  const block = Node.get(editor, issue.blockPath)
  const text = Node.string(block)
  if (text.slice(issue.start, issue.end) !== issue.text) return false

  const range = convertIssueToRange(block, issue.blockPath, issue)
  if (!range) return false

  Transforms.select(editor, range)
  if (replacement) {
    Transforms.insertText(editor, replacement)
  } else {
    Transforms.delete(editor)
  }
  return true
}

/** Applies corrections to a list in one pass by applying later issues first so edits never disturb offsets of ones still to come. */
export function batchApplySuggestedCorrections(editor: EditorInstance, issues: LocatedIssue[]): number {
  const ordered = [...issues].sort((a, b) => {
    const byBlock = Path.compare(a.blockPath, b.blockPath)
    return byBlock !== 0 ? -byBlock : b.start - a.start
  })

  let applied = 0
  Editor.withoutNormalizing(editor, () => {
    for (const issue of ordered) {
      const replacement = issue.suggestions[0]
      if (replacement === undefined) continue
      if (applySuggestedReplacement(editor, issue, replacement)) applied += 1
    }
  })

  return applied
}

/** Adds a word to the personal dictionary by invoking the Rust backend. */
export async function addToPersonalDictionary(word: string): Promise<string[]> {
  return invoke<string[]>('add_dictionary_word', { word })
}

/** Removes a word from the personal dictionary by invoking the Rust backend. */
export async function removeFromPersonalDictionary(word: string): Promise<string[]> {
  return invoke<string[]>('remove_dictionary_word', { word })
}

/** Fetches all words currently in the personal dictionary from the Rust backend. */
export async function fetchPersonalDictionaryEntries(): Promise<string[]> {
  return invoke<string[]>('get_dictionary_words')
}

export interface SpellPayload {
  rule: string
  text: string
  suggestions: string[]
  range: SlateRange
}

/** Validates that a value is a spell payload with correct structure and types. */
export function isSpellPayload(value: unknown): value is SpellPayload {
  const payload = value as SpellPayload
  return (
    !!payload &&
    typeof payload.rule === 'string' &&
    Array.isArray(payload.suggestions) &&
    SlateRange.isRange(payload.range)
  )
}

export { Text as SlateText }