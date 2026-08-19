import { Editor, Path, Point } from 'slate'
import { ReactEditor } from 'slate-react'
import type { EditorInstance } from '../editorActions'
import { PAGE_SPACER_ATTR } from './pageSpacers'

/**
 * Visual-line measurement for a Slate editable.
 *
 * Everything here works on *visual* lines — the pagination use this to report the Ln/Col
 *
 * All returned coordinates are in unscaled CSS pixels relative to the top of the editable, so the it isn't 
 * affected by the zoom
 */

export interface LineBox {
  top: number
  bottom: number
  left: number
  right: number
}

export interface LineEntry {
  /** Where the visual line starts */
  start: Point
  /** True when point came from caret hit-test */
  resolved: boolean
  /** Index of the top-level block this line belongs to. */
  blockIndex: number

  top: number

  height: number
}

/** Rects under this treshold are considered the same line */
const LINE_MERGE_EPSILON = 0.5

/**
 * Ratio between rendered pixels and layout pixels
 */
export function getScaleFactor(el: HTMLElement): number {
  const width = el.offsetWidth
  if (!width) return 1
  const scale = el.getBoundingClientRect().width / width
  return scale > 0.01 ? scale : 1
}

/** Merges raw client rects into one box per visual line. */
export function mergeRectsIntoLines(rects: DOMRect[]): LineBox[] {
  const usable = rects.filter((r) => r.height > 0)
  if (usable.length === 0) return []

  const sorted = [...usable].sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: LineBox[] = []

  for (const rect of sorted) {
    const previousLines = lines[lines.length - 1]
    const verticalMiddle = rect.top + rect.height / 2

    if (previousLines && verticalMiddle < previousLines.bottom - LINE_MERGE_EPSILON) {
      previousLines.top = Math.min(previousLines.top, rect.top)
      previousLines.bottom = Math.max(previousLines.bottom, rect.bottom)
      previousLines.left = Math.min(previousLines.left, rect.left)
      previousLines.right = Math.max(previousLines.right, rect.right)
    } else {
      lines.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right })
    }
  }

  return lines
}

/**
 * True for text that the layout must ignore
 */
function isMeasurableText(text: Text): boolean {
  if (text.data.length === 0) return false
  const parent = text.parentElement
  if (!parent) return false
  if (parent.hasAttribute('data-slate-zero-width')) return false
  return parent.closest(`[${PAGE_SPACER_ATTR}]`) === null
}

/** Rects of every measurable text node under `el`, in viewport coordinates. */
function measureTextRects(el: HTMLElement): DOMRect[] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const rects: DOMRect[] = []

  let current = walker.nextNode()
  while (current) {
    const text = current as Text
    if (isMeasurableText(text)) {
      const range = document.createRange()
      range.selectNodeContents(text)
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.height > 0 && rect.width > 0) rects.push(rect)
      }
      range.detach()
    }
    current = walker.nextNode()
  }

  return rects
}

/** Line boxes of an element, in viewport coordinates. */
export function measureLineBoxes(el: HTMLElement): LineBox[] {
  return mergeRectsIntoLines(measureTextRects(el))
}

/** A DOM text node with its position in the block's flattened character stream. */
interface TextRun {
  node: Text
  start: number
  length: number
}

/**
 * Text nodes of a block in document order, with cumulative offsets.
 *
 * Slate's zero-width placeholders are skipped: they have no visible geometry, so including them
 * would put un-probeable offsets in the middle of the search space.
 */
function collectTextRuns(el: HTMLElement): { runs: TextRun[]; totalLength: number } {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const runs: TextRun[] = []
  let totalLength = 0

  let current = walker.nextNode()
  while (current) {
    const text = current as Text
    if (isMeasurableText(text)) {
      runs.push({ node: text, start: totalLength, length: text.data.length })
      totalLength += text.data.length
    }
    current = walker.nextNode()
  }

  return { runs, totalLength }
}

/** Bounding rect of a single character, addressed by its offset in the flattened stream. */
function charRect(runs: TextRun[], offset: number): DOMRect | null {
  for (const run of runs) {
    if (offset < run.start + run.length) {
      const local = offset - run.start
      const range = document.createRange()
      range.setStart(run.node, local)
      range.setEnd(run.node, local + 1)
      const rect = range.getBoundingClientRect()
      range.detach()
      return rect.height > 0 ? rect : null
    }
  }
  return null
}

/** Nearest probeable character at or after `offset`. Collapsed whitespace has no rect of its own. */
function probeForward(runs: TextRun[], offset: number, limit: number): DOMRect | null {
  for (let i = offset; i < Math.min(offset + 4, limit); i++) {
    const rect = charRect(runs, i)
    if (rect) return rect
  }
  return null
}

/**
 * First character whose line starts at or below `targetTop`.
 *
 * Character tops increase monotonically through the text, so a binary search finds the line start
 * in O(log n) rect reads. This deliberately avoids `caretRangeFromPoint`: that hit-tests the
 * rendered viewport, so it returns whatever happens to be painted at those coordinates — the
 * toolbar, or nothing at all once the line has scrolled out of view.
 */
function findOffsetAtLineTop(
  runs: TextRun[],
  totalLength: number,
  targetTop: number,
  searchFrom: number,
): number | null {
  let low = searchFrom
  let high = totalLength - 1
  let answer: number | null = null

  while (low <= high) {
    const middle = (low + high) >> 1
    const rect = probeForward(runs, middle, totalLength)

    if (!rect) {
      low = middle + 1
      continue
    }

    if (rect.top >= targetTop - 0.5) {
      answer = middle
      high = middle - 1
    } else {
      low = middle + 1
    }
  }

  return answer
}

/** Converts a flattened offset back to a Slate point. */
function toPoint(editor: EditorInstance, runs: TextRun[], offset: number): Point | null {
  for (const run of runs) {
    if (offset < run.start + run.length) {
      try {
        return ReactEditor.toSlatePoint(editor, [run.node, offset - run.start], {
          exactMatch: false,
          suppressThrow: true,
        })
      } catch {
        return null
      }
    }
  }
  return null
}

/**
 * A block's line layout expressed relative to the block itself, so it survives content moving
 * around above it. This is what gets cached between passes.
 */
export interface RelativeLine {
  /** Path of the line's first character, relative to the block. */
  relPath: Path
  offset: number
  resolved: boolean
  /** Distance from the top of the block, unscaled px. */
  relTop: number
  height: number
}

/** Strips the absolute anchoring off measured lines so they can be cached. */
export function toRelativeLines(lines: LineEntry[], blockTop: number): RelativeLine[] {
  return lines.map((line) => ({
    relPath: line.start.path.slice(1),
    offset: line.start.offset,
    resolved: line.resolved,
    relTop: line.top - blockTop,
    height: line.height,
  }))
}

/** Re-anchors cached lines onto a block's current index and position. */
export function fromRelativeLines(
  lines: RelativeLine[],
  blockIndex: number,
  blockTop: number,
): LineEntry[] {
  return lines.map((line) => ({
    start: { path: [blockIndex, ...line.relPath], offset: line.offset },
    resolved: line.resolved,
    blockIndex,
    top: blockTop + line.relTop,
    height: line.height,
  }))
}

/**
 * Builds the visual-line index for one top-level block.
 *
 * `fallback` is used for lines whose start could not be resolved, so the index stays monotonically
 * ordered and every entry carries a usable point.
 */
export function buildBlockLines(
  editor: EditorInstance,
  el: HTMLElement,
  blockIndex: number,
  originTop: number,
  scale: number,
  fallback: Point,
): LineEntry[] {
  const boxes = measureLineBoxes(el)

  if (boxes.length === 0) {
    const rect = el.getBoundingClientRect()
    if (rect.height === 0) return []
    return [
      {
        start: fallback,
        resolved: false,
        blockIndex,
        top: (rect.top - originTop) / scale,
        height: rect.height / scale,
      },
    ]
  }

  const { runs, totalLength } = collectTextRuns(el)

  let previous = fallback
  let searchFrom = 0

  return boxes.map((box, index) => {
    // The first line always starts where the block starts; no search needed.
    let resolved: Point | null = index === 0 ? fallback : null

    if (index > 0 && totalLength > 0) {
      const offset = findOffsetAtLineTop(runs, totalLength, box.top, searchFrom)
      if (offset !== null) {
        searchFrom = offset
        resolved = toPoint(editor, runs, offset)
      }
    }

    // Never go backwards: an unresolved line reuses the last known point rather than breaking the
    // ordering the binary search in getVisualPosition depends on.
    const start = resolved && Point.compare(resolved, previous) >= 0 ? resolved : previous
    previous = start

    return {
      start,
      resolved: resolved !== null,
      blockIndex,
      top: (box.top - originTop) / scale,
      height: (box.bottom - box.top) / scale,
    }
  })
}

/** Visual-line index for the whole document. */
export function buildLineIndex(editor: EditorInstance, editable: HTMLElement): LineEntry[] {
  const scale = getScaleFactor(editable)
  const originTop = editable.getBoundingClientRect().top
  const children = Array.from(editable.children) as HTMLElement[]
  const lines: LineEntry[] = []

  children.forEach((child, blockIndex) => {
    const fallback: Point = { path: [blockIndex, 0], offset: 0 }
    lines.push(...buildBlockLines(editor, child, blockIndex, originTop, scale, fallback))
  })

  return lines
}

/**
 * Ln/Col for a caret, against a visual-line index.
 *
 * `column` counts characters from the start of the *visual* line, so it is unaffected by the leaf
 * splits Slate creates at every formatting boundary — walking through a bold word mid-line no
 * longer resets the column to 1.
 */
export function getVisualPosition(
  editor: EditorInstance,
  lines: LineEntry[],
  caret: Point,
): { line: number; column: number } {
  if (lines.length === 0) return { line: 1, column: caret.offset + 1 }

  let low = 0
  let high = lines.length - 1
  let index = 0

  while (low <= high) {
    const middle = (low + high) >> 1
    if (Point.compare(lines[middle].start, caret) <= 0) {
      index = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  const entry = lines[index]

  let column = 1
  try {
    column = Editor.string(editor, { anchor: entry.start, focus: caret }).length + 1
  } catch {
    column = caret.offset + 1
  }

  return { line: index + 1, column }
}
