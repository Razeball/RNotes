import { invoke } from '@tauri-apps/api/core'
import { Editor, Element as SlateElement, Node, Path, Point, Range as SlateRange, Text, Transforms } from 'slate'
import type { EditorInstance } from '../editorActions'

/** Spell checker orchestrator that coordinates between Rust backend (src-tauri/src/spellcheck.rs) and Slate editor by deciding when to request checks and mapping results onto Slate positions. */

export interface SpellIssue {
  /** UTF-16 offsets into the block's whole text which is what Slate offsets count in. */
  start: number
  end: number
  text: string
  rule: string
  suggestions: string[]
}

/** An issue placed in the document ready to act on. */
export interface LocatedIssue extends SpellIssue {
  blockPath: Path
  range: SlateRange
}

/** The rules the backend can report so the UI can turn them into translated messages. */
export const SPELL_RULES = [
  'spelling',
  'repeated-word',
  'double-space',
  'space-before-punctuation',
  'lowercase-after-period',
] as const

/** Cached issues keyed on block node object rather than path because paths shift when blocks move and stale paths would underline wrong words. */
const cache = new WeakMap<object, { text: string; issues: SpellIssue[] }>()

/** Blocks that hold text directly like paragraphs not wrappers like tables or lists. */
function isCheckableBlock(editor: EditorInstance, node: Node): node is SlateElement {
  if (!SlateElement.isElement(node) || !Editor.isBlock(editor, node)) return false
  if (node.type === 'image') return false
  return !node.children.some((child) => SlateElement.isElement(child) && Editor.isBlock(editor, child))
}

function checkableBlocks(editor: EditorInstance): [SlateElement, Path][] {
  return Array.from(
    Editor.nodes(editor, { at: [], match: (n) => isCheckableBlock(editor, n) })
  ) as [SlateElement, Path][]
}

/** Returns cached issues for a block or empty list when its text has moved on since the last check. */
export function getIssuesForBlock(block: Node): SpellIssue[] {
  const entry = cache.get(block as object)
  if (!entry) return []
  return entry.text === getBlockLayout(block).text ? entry.issues : []
}

/** Re-checks whatever changed by batching a whole document command instead of one per block because the round trip dominates the cost. Returns true when any result moved so caller knows whether re-render is worth it. */
export async function updateSpellingChecks(editor: EditorInstance, language: string): Promise<boolean> {
  const blocks = checkableBlocks(editor)
  const stale: { block: SlateElement; text: string }[] = []

  for (const [block] of blocks) {
    const text = Node.string(block)
    const entry = cache.get(block as object)
    if (!entry || entry.text !== text) stale.push({ block, text })
  }

  if (stale.length === 0) return false

  const results = await invoke<SpellIssue[][]>('check_spelling_batch', {
    blocks: stale.map((item) => item.text),
    language,
  })

  stale.forEach((item, index) => {
    cache.set(item.block as object, { text: item.text, issues: results[index] ?? [] })
    decorationCache.delete(item.block as object)
  })

  return true
}

/** Clears all cached spelling check data from checkable blocks in the editor. */
export function invalidateSpellCheckCache(editor: EditorInstance): void {
  for (const [block] of checkableBlocks(editor)) {
    cache.delete(block as object)
    decorationCache.delete(block as object)
  }
}

/** Returns where a text node starts inside its block counted the same way Node.string concatenates. */
export function findTextPositionInsideBlock(block: Node, blockPath: Path, textPath: Path): number {
  const relative = textPath.slice(blockPath.length).join()
  return getBlockLayout(block).byKey.get(relative)?.start ?? 0
}

/** Computes once per block object where each of the block's text nodes sits inside its concatenated text. Slate replaces block object when content changes so it invalidates itself. */
interface BlockLayout {
  text: string
  entries: { key: string; path: Path; start: number; length: number }[]
  byKey: Map<string, { path: Path; start: number; length: number }>
}

const layoutCache = new WeakMap<object, BlockLayout>()

function getBlockLayout(block: Node): BlockLayout {
  const cached = layoutCache.get(block as object)
  if (cached) return cached

  const entries: BlockLayout['entries'] = []
  const byKey: BlockLayout['byKey'] = new Map()
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

/** Turns a block-relative offset into a Slate point. */
function resolvePointFromOffset(block: Node, blockPath: Path, offset: number): Point | null {
  const { entries } = getBlockLayout(block)
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
  const anchor = resolvePointFromOffset(block, blockPath, issue.start)
  const focus = resolvePointFromOffset(block, blockPath, issue.end)
  return anchor && focus ? { anchor, focus } : null
}

/** Serialised block issues already resolved to ranges and memoised for the same reason as layout: decorate runs per text node per render. */
interface BlockDecorations {
  pathKey: string
  ranges: { start: number; end: number; payload: string }[]
}

const decorationCache = new WeakMap<object, BlockDecorations>()

function generateBlockDecorations(block: Node, blockPath: Path): BlockDecorations['ranges'] {
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

/** Extracts spell ranges covering one text node clipped to it. */
export function extractSpellRangesFromNode(
  block: Node,
  blockPath: Path,
  textPath: Path,
  textLength: number
): SlateRange[] {
  const decorations = generateBlockDecorations(block, blockPath)
  if (decorations.length === 0) return []

  const nodeStart = findTextPositionInsideBlock(block, blockPath, textPath)
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
export function gatherAllIssues(editor: EditorInstance): LocatedIssue[] {
  const located: LocatedIssue[] = []

  for (const [block, blockPath] of checkableBlocks(editor)) {
    for (const issue of getIssuesForBlock(block)) {
      const range = convertIssueToRange(block, blockPath, issue)
      if (range) located.push({ ...issue, blockPath, range })
    }
  }

  return located
}

/** Performs a single correction by applying one replacement string to fix an issue. */
export function performSingleCorrection(editor: EditorInstance, issue: LocatedIssue, replacement: string): boolean {
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

/** Corrects a whole list in one pass by applying later issues first so edits never disturb offsets of ones still to come. */
export function applyCorrectedSuggestions(editor: EditorInstance, issues: LocatedIssue[]): number {
  const ordered = [...issues].sort((a, b) => {
    const byBlock = Path.compare(a.blockPath, b.blockPath)
    return byBlock !== 0 ? -byBlock : b.start - a.start
  })

  let applied = 0
  Editor.withoutNormalizing(editor, () => {
    for (const issue of ordered) {
      const replacement = issue.suggestions[0]
      if (replacement === undefined) continue
      if (performSingleCorrection(editor, issue, replacement)) applied += 1
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

/** Spell payload carried by decorations so hover or right-click can act without re-resolving anything. */
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