import { Editor, Element as SlateElement, Text, Transforms } from 'slate'
import type { EditorInstance } from '../editorActions'
import { toggleCheckList, toggleOrderedList, toggleUnorderedList } from '../editorActions'

/** Markdown typed into the editor. Parsing lives in Rust (src-tauri/src/markdown.rs). 
 * This module only covers as-you-type case with synchronous conversion on space for block prefixes and finished inline spans. */

type InlineMark = 'bold' | 'italic' | 'code' | 'crossedOut'

interface InlineRule {
  pattern: RegExp
  mark: InlineMark
  delimiter: string
}

/** Longest delimiters first so **x** reads as bold rather than italic. Single-character rules check character before span to simulate lookbehind for WebKit compatibility on Linux. */
const INLINE_RULES: InlineRule[] = [
  { pattern: /(\*\*([^*]+)\*\*)$/, mark: 'bold', delimiter: '*' },
  { pattern: /(__([^_]+__))$/, mark: 'bold', delimiter: '_' },
  { pattern: /(~~([^~]+)~~)$/, mark: 'crossedOut', delimiter: '~' },
  { pattern: /(`([^`]+)`)$/, mark: 'code', delimiter: '`' },
  { pattern: /(\*([^*]+)\*)$/, mark: 'italic', delimiter: '*' },
  { pattern: /(_([^_]+)_)$/, mark: 'italic', delimiter: '_' },
]

const HEADING_PREFIXES: { marker: string; type: 'header' | 'header2' | 'header3' | 'header4' }[] = [
  { marker: '####', type: 'header4' },
  { marker: '###', type: 'header3' },
  { marker: '##', type: 'header2' },
  { marker: '#', type: 'header' },
]

/** Detects whether pasted text is worth handing to the markdown parser by checking for block constructs or common inline patterns. */
export function detectsMarkdownText(text: string): boolean {
  if (!text.trim()) return false

  const hasBlockConstruct = text.split(/\r?\n/).some(
    (line) =>
      /^#{1,4}\s+\S/.test(line) ||
      /^\s*[-*+]\s+\S/.test(line) ||
      /^\s*\d+[.)]\s+\S/.test(line) ||
      /^\s*>\s+\S/.test(line) ||
      /^\s*```/.test(line) ||
      /^\s*\|.*\|\s*$/.test(line),
  )
  if (hasBlockConstruct) return true

  return (
    /\*\*[^*\n]+\*\*/.test(text) ||
    /~~[^~\n]+~~/.test(text) ||
    /`[^`\n]+`/.test(text) ||
    /\[[^\]\n]+\]\([^)\s]+\)/.test(text)
  )
}

/** Returns the caret's text node and text before it when selection is a plain collapsed caret, or null if not applicable. */
function getCurrentCaretContext(editor: EditorInstance) {
  const { selection } = editor
  if (!selection) return null
  if (selection.anchor.path.join() !== selection.focus.path.join()) return null
  if (selection.anchor.offset !== selection.focus.offset) return null

  const path = selection.anchor.path
  const offset = selection.anchor.offset

  const [node] = Editor.node(editor, path)
  if (!Text.isText(node)) return null

  const block = Editor.above(editor, {
    at: path,
    match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
  })
  if (!block) return null

  return { path, offset, blockPath: block[1], before: node.text.slice(0, offset) }
}

/** Sets the block type of all matching blocks by replacing the entire node with one of the specified element type. */
function changeBlockNodeToType(editor: EditorInstance, type: string) {
  Transforms.setNodes(editor, { type } as Partial<SlateElement>, {
    match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
  })
}

/** Removes the inserted marker characters from the start of a block by selecting and deleting the range. */
function removeInsertedMarkers(editor: EditorInstance, path: number[], length: number) {
  Transforms.delete(editor, {
    at: { anchor: { path, offset: 0 }, focus: { path, offset: length } },
  })
}

/** Handles block-level markers filling the start of a block. Returns true when a marker was consumed and space is swallowed. */
function handleBlockLevelMarker(editor: EditorInstance): boolean {
  const context = getCurrentCaretContext(editor)
  if (!context) return false

  // Only at the very start of the block — a # b is not a heading.
  const atBlockStart =
    context.path.length === context.blockPath.length + 1 &&
    context.path[context.path.length - 1] === 0
  if (!atBlockStart) return false

  const marker = context.before

  for (const { marker: candidate, type } of HEADING_PREFIXES) {
    if (marker === candidate) {
      removeInsertedMarkers(editor, context.path, candidate.length)
      changeBlockNodeToType(editor, type)
      return true
    }
  }

  // - already turn the text into a list so to make a checkbutton you only need [] or [x]
  const taskBox = marker.match(/^\[([ xX]?)\]$/)
  if (taskBox) {
    const [existing] = Editor.nodes(editor, {
      match: (n) => SlateElement.isElement(n) && n.type === 'check',
    })
    removeInsertedMarkers(editor, context.path, marker.length)
    if (!existing) toggleCheckList(editor)
    Transforms.setNodes(
      editor,
      { checked: taskBox[1].toLowerCase() === 'x' } as Partial<SlateElement>,
      { match: (n) => SlateElement.isElement(n) && n.type === 'check' },
    )
    return true
  }

  if (marker === '-' || marker === '*' || marker === '+') {
    removeInsertedMarkers(editor, context.path, marker.length)
    toggleUnorderedList(editor)
    return true
  }

  if (/^\d+[.)]$/.test(marker)) {
    removeInsertedMarkers(editor, context.path, marker.length)
    toggleOrderedList(editor)
    return true
  }

  if (marker === '>') {
    removeInsertedMarkers(editor, context.path, marker.length)
    Editor.addMark(editor, 'quote', true)
    return true
  }

  return false
}

/** Converts a finished inline span ending at the caret. Returns true when one was converted and delimiters were removed. */
function convertFinishedInlineSpan(editor: EditorInstance): boolean {
  const context = getCurrentCaretContext(editor)
  if (!context) return false

  for (const rule of INLINE_RULES) {
    const match = context.before.match(rule.pattern)
    if (!match) continue

    const [, span, inner] = match
    if (!inner.trim()) continue

    const spanStart = context.offset - span.length
    if (spanStart > 0 && context.before[spanStart - 1] === rule.delimiter) continue

    const spanRange = {
      anchor: { path: context.path, offset: spanStart },
      focus: { path: context.path, offset: context.offset },
    }

    Transforms.select(editor, spanRange)
    Transforms.insertText(editor, inner)

    Transforms.setNodes(
      editor,
      { [rule.mark]: true },
      {
        at: {
          anchor: { path: context.path, offset: spanStart },
          focus: { path: context.path, offset: spanStart + inner.length },
        },
        match: Text.isText,
        split: true,
      },
    )

    Transforms.collapse(editor, { edge: 'end' })
    // Prevent the space that triggered this from inheriting the mark.
    Editor.removeMark(editor, rule.mark)
    return true
  }

  return false
}

/** Handles space key press in markdown editor. Returns true when the key was consumed and caller should not insert a space. */
export function processMarkdownSpace(editor: EditorInstance): boolean {
  if (handleBlockLevelMarker(editor)) return true
  convertFinishedInlineSpan(editor)
  return false
}